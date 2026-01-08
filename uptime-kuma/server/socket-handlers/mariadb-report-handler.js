const { checkLogin } = require("../util-server");
const mysql = require("mysql2/promise");
const dayjs = require("dayjs");
const axios = require("axios");

// Database configuration
const DB_CONFIG = {
    host: process.env.UPTIME_KUMA_DB_HOSTNAME || process.env.MARIADB_HOST || "localhost",
    port: process.env.UPTIME_KUMA_DB_PORT || 3306,
    user: process.env.UPTIME_KUMA_DB_USERNAME || process.env.MARIADB_USER || "kuma",
    password: process.env.UPTIME_KUMA_DB_PASSWORD || process.env.MARIADB_PASSWORD || "secret",
    database: process.env.UPTIME_KUMA_DB_NAME || process.env.MARIADB_DATABASE || "kuma",
    connectionLimit: 5
};

let pool;

/**
 * Get or create database connection pool
 */
function getPool() {
    if (!pool) {
        pool = mysql.createPool(DB_CONFIG);
    }
    return pool;
}

/**
 * Ask the SRE Agent for reasoning.
 * @param {string} message - The question or monitor error details.
 * @param {string} threadId - Unique ID for the conversation context (optional).
 * @returns {Promise<string>} - The agent's reasoning.
 */
async function askSREAgent(message, threadId = "system") {
    const AGENT_URL = process.env.MCP_AGENT_URL || "http://mcp-agent:8000/chat";

    try {
        const response = await fetch(AGENT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: message,
                thread_id: threadId
            })
        });

        if (!response.ok) {
            throw new Error(`Agent API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response;

    } catch (error) {
        console.error("Failed to talk to SRE Agent:", error);
        return "⚠️ SRE Agent is unreachable.";
    }
}

/**
 * MariaDB Report Socket Handler
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.mariadbReportHandler = (socket) => {
    socket.on("getDynamicReport", async (monitorID, type, year, month, week, callback) => {
        try {
            checkLogin(socket);

            // Calculate date range
            let startDate, endDate;

            if (type === "weekly") {
                const weeksAgo = week || 0;
                endDate = dayjs().subtract(weeksAgo, 'week').endOf('week');
                startDate = endDate.startOf('week');
            } else {
                startDate = dayjs().year(year).month(month).startOf("month");
                endDate = startDate.endOf("month");
            }

            const startDateStr = startDate.format('YYYY-MM-DD HH:mm:ss');
            const endDateStr = endDate.format('YYYY-MM-DD HH:mm:ss');

            console.log(`Generating report for monitor ${monitorID} from ${startDateStr} to ${endDateStr}`);

            // Connect to MariaDB
            const db = getPool();

            // Fetch Monitor Details (URL/Hostname)
            const [monitors] = await db.execute(
                `SELECT url, hostname, type FROM monitor WHERE id = ?`,
                [monitorID]
            );

            let monitorUrl = "";
            let certInfo = null;

            if (monitors.length > 0) {
                // Use URL for HTTP/keyword, hostname for others if URL is missing
                monitorUrl = monitors[0].url || monitors[0].hostname;
            }

            // Fetch heartbeats
            const [heartbeats] = await db.execute(
                `SELECT status, ping, time, msg 
                 FROM heartbeat 
                 WHERE monitor_id = ? 
                 AND time BETWEEN ? AND ? 
                 ORDER BY time ASC`,
                [monitorID, startDateStr, endDateStr]
            );

            // Fetch Expiry Info from SRE Agent if URL exists
            if (monitorUrl) {
                try {
                    console.log(`Checking expiry for ${monitorUrl}...`);
                    const expiryPrompt = `Check domain expiry for ${monitorUrl}. Return ONLY a JSON object with keys: "expiryDate" (string format YYYY-MM-DD) and "daysLeft" (number). Do not include any other text.`;
                    const expiryResponse = await askSREAgent(expiryPrompt, `expiry-${monitorID}`);

                    // Attempt to parse JSON from response
                    // Sanitize potential markdown code blocks if the agent adds them
                    const jsonStr = expiryResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                    certInfo = JSON.parse(jsonStr);
                } catch (err) {
                    console.warn("Failed to fetch/parse expiry info:", err);
                    certInfo = { expiryDate: "N/A", daysLeft: "N/A" };
                }
            } else {
                certInfo = { expiryDate: "N/A", daysLeft: "N/A" };
            }

            // Process data locally
            let upChecks = 0;
            let downChecks = 0;
            let maintenanceChecks = 0;
            let totalPingSum = 0;
            let totalPingCount = 0;
            const downtimeEvents = [];
            let maintenanceDurationMs = 0;

            // Grouping variables
            let currentDowntime = null;
            let currentMaintenance = null;

            const dailyStatsMap = {};

            // Helper to handle daily stats init
            const getDayStat = (time) => {
                const day = dayjs(time).format('YYYY-MM-DD');
                if (!dailyStatsMap[day]) {
                    dailyStatsMap[day] = {
                        date: day,
                        up: 0,
                        down: 0,
                        maintenance: 0,
                        total: 0,
                        pingSum: 0,
                        pingCount: 0
                    };
                }
                return dailyStatsMap[day];
            };

            for (const hb of heartbeats) {
                const dayStat = getDayStat(hb.time);
                dayStat.total++;

                if (hb.status === 1) {
                    // UP
                    upChecks++;
                    dayStat.up++;
                    if (hb.ping !== null) {
                        totalPingSum += hb.ping;
                        totalPingCount++;
                        dayStat.pingSum += hb.ping;
                        dayStat.pingCount++;
                    }

                    // End Downtime if active
                    if (currentDowntime) {
                        currentDowntime.endTime = hb.time;
                        currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
                        downtimeEvents.push(currentDowntime);
                        currentDowntime = null;
                    }
                    // End Maintenance if active
                    if (currentMaintenance) {
                        const mEnd = hb.time;
                        maintenanceDurationMs += dayjs(mEnd).diff(dayjs(currentMaintenance));
                        currentMaintenance = null;
                    }

                } else if (hb.status === 0) {
                    // DOWN
                    downChecks++;
                    dayStat.down++;
                    const msg = hb.msg || "Unknown error";

                    if (!currentDowntime) {
                        currentDowntime = {
                            startTime: hb.time,
                            endTime: null,
                            msg: msg,
                            recommendation: "Fetching advice..."
                        };
                    } else if (msg !== "Unknown error" && currentDowntime.msg === "Unknown error") {
                        currentDowntime.msg = msg;
                    }

                    // End Maintenance if active (Maintenance -> Down transition)
                    if (currentMaintenance) {
                        const mEnd = hb.time;
                        maintenanceDurationMs += dayjs(mEnd).diff(dayjs(currentMaintenance));
                        currentMaintenance = null;
                    }

                } else if (hb.status === 3) {
                    // MAINTENANCE
                    maintenanceChecks++;
                    dayStat.maintenance++;

                    if (!currentMaintenance) {
                        currentMaintenance = hb.time;
                    }

                    // End Downtime if active (Down -> Maintenance transition)
                    if (currentDowntime) {
                        currentDowntime.endTime = hb.time;
                        currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
                        downtimeEvents.push(currentDowntime);
                        currentDowntime = null;
                    }
                }
                // Status 2 (Pending) ignored for transitions
            }

            // Close open events at end of period
            if (currentDowntime) {
                currentDowntime.endTime = endDateStr;
                currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
                downtimeEvents.push(currentDowntime);
            }
            if (currentMaintenance) {
                maintenanceDurationMs += dayjs(endDateStr).diff(dayjs(currentMaintenance));
            }

            // Helper to format duration with high precision
            const formatDuration = (ms) => {
                if (ms === 0) return "0";
                if (ms < 1000) return `${Math.floor(ms)}ms`;
                if (ms < 10000) return `${(ms / 1000).toFixed(2)}s`;

                const sec = Math.floor(ms / 1000);
                if (sec < 60) return `${sec}s`;

                const min = Math.floor(sec / 60);
                const rmSec = sec % 60;

                // If we have minutes, we might skip seconds if they are 0, or just show them
                // User Request: "1 min" instead of "1 min 0 sec"
                if (min < 60) {
                    if (rmSec === 0) {
                        return `${min} ${min === 1 ? 'Min' : 'Mins'}`;
                    }
                    return `${min} ${min === 1 ? 'Min' : 'Mins'} ${rmSec} ${rmSec === 1 ? 'Sec' : 'Secs'}`;
                }

                const hrs = Math.floor(min / 60);
                const rmMin = min % 60;

                // If we have hours, we optimize display
                if (rmMin === 0 && rmSec === 0) {
                    return `${hrs} ${hrs === 1 ? 'Hr' : 'Hrs'}`;
                }

                if (rmSec === 0) {
                    return `${hrs} ${hrs === 1 ? 'Hr' : 'Hrs'} ${rmMin} ${rmMin === 1 ? 'Min' : 'Mins'}`;
                }

                return `${hrs} ${hrs === 1 ? 'Hr' : 'Hrs'} ${rmMin} ${rmMin === 1 ? 'Min' : 'Mins'} ${rmSec} ${rmSec === 1 ? 'Sec' : 'Secs'}`;
            };

            // Format for long durations (days)
            // Format for long durations (days)
            const formatLongDuration = (ms) => {
                const sec = Math.floor(ms / 1000);
                const min = Math.floor(sec / 60);
                const hrs = Math.floor(min / 60);
                const days = Math.floor(hrs / 24);

                if (days > 0) {
                    const rmHrs = hrs % 24;
                    const rmMin = min % 60;

                    let str = `${days} ${days === 1 ? 'Day' : 'Days'}`;
                    if (rmHrs > 0) str += ` ${rmHrs} ${rmHrs === 1 ? 'Hr' : 'Hrs'}`;
                    if (rmMin > 0) str += ` ${rmMin} ${rmMin === 1 ? 'Min' : 'Mins'}`;
                    return str;
                }
                return formatDuration(ms);
            };

            // Calculate Metrics
            let totalDowntimeMs = 0;
            const uniqueErrors = new Set();

            downtimeEvents.forEach(evt => {
                totalDowntimeMs += evt.duration;
                uniqueErrors.add(evt.msg);
                evt.durationStr = formatDuration(evt.duration);
            });

            // Total Period Duration used for coverage
            const reportTotalMs = endDate.diff(startDate);

            // MTTR = Total Downtime / Incident Count
            const avgDowntimeMs = downtimeEvents.length > 0 ? totalDowntimeMs / downtimeEvents.length : 0;

            // Total Uptime Duration
            const totalUptimeMs = reportTotalMs - totalDowntimeMs - maintenanceDurationMs;

            // MTBF = Total Uptime / Incident Count
            const mtbfMs = downtimeEvents.length > 0 ? totalUptimeMs / downtimeEvents.length : totalUptimeMs;

            const downtimePercent = reportTotalMs > 0 ? (totalDowntimeMs / reportTotalMs * 100) : 0;
            const uptimePercent = (100 - downtimePercent);

            // Suspended/Maintenance stats
            const maintenancePercent = reportTotalMs > 0 ? (maintenanceDurationMs / reportTotalMs * 100) : 0;

            // Get SRE Recommendations
            const MAX_ERRORS_TO_CHECK = 10;
            const errorsArray = Array.from(uniqueErrors).slice(0, MAX_ERRORS_TO_CHECK);

            console.log(`Fetching SRE advice for ${errorsArray.length} unique errors...`);

            const adviceMap = {};

            for (const errorMsg of errorsArray) {
                const exampleEvent = downtimeEvents.find(e => e.msg === errorMsg);
                const durationContext = exampleEvent ? exampleEvent.durationStr : "unknown";

                const prompt = `
                    You are a Site Reliability Engineer (SRE) Agent.
                    I encountered a monitor error: "${errorMsg}".
                    The downtime lasted for approximately ${durationContext}.
                    Please provide a concise analysis in two parts:
                    1. <b>Reasoning:</b> Brief technical explanation of why this error occurred.
                    2. <b>Recommendation:</b> Actionable steps to fix or investigate it.
                    Use HTML tags like <b>, <br>, and <ul> for formatting. Do not use Markdown.
                `.trim().replace(/\s+/g, ' ');

                const advice = await askSREAgent(prompt, `monitor-${monitorID}`);
                adviceMap[errorMsg] = advice;
            }

            downtimeEvents.forEach(event => {
                if (adviceMap[event.msg]) {
                    event.recommendation = adviceMap[event.msg];
                } else if (uniqueErrors.size > MAX_ERRORS_TO_CHECK && !adviceMap[event.msg]) {
                    event.recommendation = "Advice not fetched (limit reached).";
                }
            });

            // Create final daily stats array
            const dailyStats = Object.values(dailyStatsMap).sort((a, b) => a.date.localeCompare(b.date)).map(dayStat => {
                return {
                    date: dayStat.date,
                    uptime: dayStat.total > 0 ? (dayStat.up / dayStat.total) : 0,
                    avgPing: dayStat.pingCount > 0 ? (dayStat.pingSum / dayStat.pingCount) : null,
                    checks: dayStat.total,
                    up: dayStat.up,
                    down: dayStat.down,
                    maintenance: dayStat.maintenance
                };
            });

            callback({
                ok: true,
                startDate: startDate.format('YYYY-MM-DD'),
                endDate: endDate.format('YYYY-MM-DD'),
                summary: {
                    uptime: uptimePercent / 100, // keep as 0-1 for consistency with existing UI expectations
                    avgPing: totalPingCount > 0 ? (totalPingSum / totalPingCount) : null,

                    // New/Updated Fields
                    totalDowntimeDuration: formatLongDuration(totalDowntimeMs),
                    totalDowntimePercent: downtimePercent.toFixed(2),
                    totalUptimeDuration: formatLongDuration(totalUptimeMs),
                    totalUptimePercent: uptimePercent.toFixed(2),

                    downtimeCount: downtimeEvents.length,
                    avgDowntime: formatDuration(avgDowntimeMs), // Used as MTTR display in old card, but we have specific MTTR now

                    mttr: formatDuration(avgDowntimeMs),
                    mtbf: formatLongDuration(mtbfMs),

                    maintenanceDuration: formatLongDuration(maintenanceDurationMs),
                    maintenancePercent: maintenancePercent.toFixed(2) + "%",

                    // Expiry Data
                    certInfo: certInfo
                },
                dailyStats,
                downtimeEvents
            });

        } catch (e) {
            console.error("Report generation error:", e);
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
