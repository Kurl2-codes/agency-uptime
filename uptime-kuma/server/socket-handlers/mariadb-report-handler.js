const { checkLogin } = require("../util-server");
const dayjs = require("dayjs");
const { R } = require("redbean-node");
const Monitor = require("../model/monitor");

/**
 * Ask the SRE Agent for reasoning.
 * @param {string} message - The question or monitor error details.
 * @param {string} threadId - Unique ID for the conversation context (optional).
 * @returns {Promise<string>} - The agent's reasoning.
 */
async function askSREAgent(message, threadId = "system") {
    const AGENT_URL = process.env.MCP_AGENT_URL || "http://127.0.0.1:8000/chat";

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
 * Format Duration helper
 */
const formatDuration = (ms) => {
    if (ms === 0) {
        return "0";
    }
    if (ms < 1000) {
        return `${Math.floor(ms)}ms`;
    }
    if (ms < 10000) {
        return `${(ms / 1000).toFixed(2)}s`;
    }

    const sec = Math.floor(ms / 1000);
    if (sec < 60) {
        return `${sec}s`;
    }

    const min = Math.floor(sec / 60);
    const rmSec = sec % 60;

    if (min < 60) {
        if (rmSec === 0) {
            return `${min} ${min === 1 ? "Min" : "Mins"}`;
        }
        return `${min} ${min === 1 ? "Min" : "Mins"} ${rmSec} ${rmSec === 1 ? "Sec" : "Secs"}`;
    }

    const hrs = Math.floor(min / 60);
    const rmMin = min % 60;

    if (rmMin === 0 && rmSec === 0) {
        return `${hrs} ${hrs === 1 ? "Hr" : "Hrs"}`;
    }

    if (rmSec === 0) {
        return `${hrs} ${hrs === 1 ? "Hr" : "Hrs"} ${rmMin} ${rmMin === 1 ? "Min" : "Mins"}`;
    }

    return `${hrs} ${hrs === 1 ? "Hr" : "Hrs"} ${rmMin} ${rmMin === 1 ? "Min" : "Mins"} ${rmSec} ${rmSec === 1 ? "Sec" : "Secs"}`;
};

const formatLongDuration = (ms) => {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hrs = Math.floor(min / 60);
    const days = Math.floor(hrs / 24);

    if (days > 0) {
        const rmHrs = hrs % 24;
        const rmMin = min % 60;

        let str = `${days} ${days === 1 ? "Day" : "Days"}`;
        if (rmHrs > 0) {
            str += ` ${rmHrs} ${rmHrs === 1 ? "Hr" : "Hrs"}`;
        }
        if (rmMin > 0) {
            str += ` ${rmMin} ${rmMin === 1 ? "Min" : "Mins"}`;
        }
        return str;
    }
    return formatDuration(ms);
};

// SRE Advice Cache
const adviceCache = {};
const MAX_CACHE_SIZE = 100;

/**
 * Generate Stats for a Single Monitor
 */
async function generateSingleMonitorStats(monitorID, startDate, endDate) {
    const startDateStr = startDate.format("YYYY-MM-DD HH:mm:ss");
    const endDateStr = endDate.format("YYYY-MM-DD HH:mm:ss");

    // Fetch Monitor Details (URL/Hostname) via RedBean
    const monitor = await R.findOne("monitor", " id = ? ", [monitorID]);

    let monitorName = "Unknown Monitor";
    let monitorUrl = "";
    let certInfo = null;

    if (monitor) {
        monitorName = monitor.name;
        monitorUrl = monitor.url || monitor.hostname;
    }

    // Fetch heartbeats via RedBean
    // R.getAll returns array of objects
    const heartbeats = await R.getAll(
        `SELECT status, ping, time, msg 
         FROM heartbeat 
         WHERE monitor_id = ? 
         AND time BETWEEN ? AND ? 
         ORDER BY time ASC`,
        [monitorID, startDateStr, endDateStr]
    );

    // Start Expiry Check in Parallel (Non-blocking)
    let certInfoPromise = Promise.resolve({ expiryDate: "N/A", daysLeft: "N/A" });

    if (monitorUrl) {
        const expiryPrompt = `Check domain expiry for ${monitorUrl}. Return ONLY a JSON object with keys: "expiryDate" (string format YYYY-MM-DD) and "daysLeft" (number). Do not include any other text.`;

        certInfoPromise = askSREAgent(expiryPrompt, `expiry-${monitorID}`)
            .then(expiryResponse => {
                try {
                    const jsonStr = expiryResponse.replace(/```json/g, "").replace(/```/g, "").trim();
                    return JSON.parse(jsonStr);
                } catch (err) {
                    console.warn("Failed to parse expiry info:", err);
                    return { expiryDate: "N/A", daysLeft: "N/A" };
                }
            })
            .catch(err => {
                console.warn("Failed to fetch expiry info:", err);
                return { expiryDate: "N/A", daysLeft: "N/A" };
            });
    }

    // Process data locally
    let upChecks = 0;
    let downChecks = 0;
    let maintenanceChecks = 0;
    let totalPingSum = 0;
    let totalPingCount = 0;
    const downtimeEvents = [];
    let maintenanceDurationMs = 0;

    let currentDowntime = null;
    let currentMaintenance = null;

    const dailyStatsMap = {};

    const getDayStat = (time) => {
        const day = dayjs(time).format("YYYY-MM-DD");
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

        if (hb.status === 1) { // UP
            upChecks++;
            dayStat.up++;
            if (hb.ping !== null) {
                totalPingSum += hb.ping;
                totalPingCount++;
                dayStat.pingSum += hb.ping;
                dayStat.pingCount++;
            }

            if (currentDowntime) {
                currentDowntime.endTime = hb.time;
                currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
                downtimeEvents.push(currentDowntime);
                currentDowntime = null;
            }
            if (currentMaintenance) {
                const mEnd = hb.time;
                maintenanceDurationMs += dayjs(mEnd).diff(dayjs(currentMaintenance));
                currentMaintenance = null;
            }

        } else if (hb.status === 0) { // DOWN
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

            if (currentMaintenance) {
                const mEnd = hb.time;
                maintenanceDurationMs += dayjs(mEnd).diff(dayjs(currentMaintenance));
                currentMaintenance = null;
            }

        } else if (hb.status === 3) { // MAINTENANCE
            maintenanceChecks++;
            dayStat.maintenance++;

            if (!currentMaintenance) {
                currentMaintenance = hb.time;
            }

            if (currentDowntime) {
                currentDowntime.endTime = hb.time;
                currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
                downtimeEvents.push(currentDowntime);
                currentDowntime = null;
            }
        }
    }

    if (currentDowntime) {
        currentDowntime.endTime = endDateStr;
        currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));
        downtimeEvents.push(currentDowntime);
    }
    if (currentMaintenance) {
        maintenanceDurationMs += dayjs(endDateStr).diff(dayjs(currentMaintenance));
    }

    // Calculate Metrics
    let totalDowntimeMs = 0;
    const uniqueErrors = new Set();

    downtimeEvents.forEach(evt => {
        totalDowntimeMs += evt.duration;
        uniqueErrors.add(evt.msg);
        evt.durationStr = formatDuration(evt.duration);
    });

    const reportTotalMs = endDate.diff(startDate);
    const avgDowntimeMs = downtimeEvents.length > 0 ? totalDowntimeMs / downtimeEvents.length : 0;
    const totalUptimeMs = reportTotalMs - totalDowntimeMs - maintenanceDurationMs;
    const mtbfMs = downtimeEvents.length > 0 ? totalUptimeMs / downtimeEvents.length : totalUptimeMs;

    const downtimePercent = reportTotalMs > 0 ? (totalDowntimeMs / reportTotalMs * 100) : 0;
    const uptimePercent = Math.max(0, 100 - downtimePercent);
    const maintenancePercent = reportTotalMs > 0 ? (maintenanceDurationMs / reportTotalMs * 100) : 0;

    // SRE Recommendations
    const MAX_ERRORS_TO_CHECK = 10;
    const errorsArray = Array.from(uniqueErrors).slice(0, MAX_ERRORS_TO_CHECK);
    const adviceMap = {};

    // PARALLEL: Fetch advice for unique errors concurrently
    const advicePromises = errorsArray.map(async (errorMsg) => {
        // 1. Check Cache
        if (adviceCache[errorMsg]) {
            console.log(`[Report] Serving cached advice for: "${errorMsg}"`);
            return { errorMsg, advice: adviceCache[errorMsg] };
        }

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
        `.trim().replace(/\s+/g, " ");

        try {
            console.log(`[Report] Fetching fresh advice for: "${errorMsg}"`);
            const advice = await askSREAgent(prompt, `monitor-${monitorID}`);

            // 2. Store in Cache
            if (Object.keys(adviceCache).length >= MAX_CACHE_SIZE) {
                // Simple flush if too big
                for (const key in adviceCache) delete adviceCache[key];
            }
            adviceCache[errorMsg] = advice;

            return { errorMsg, advice };
        } catch (err) {
            console.error(`Failed to get advice for ${errorMsg}:`, err);
            return { errorMsg, advice: "Analysis failed." };
        }
    });

    const [adviceResults, fetchedCertInfo] = await Promise.all([
        Promise.all(advicePromises),
        certInfoPromise
    ]);

    certInfo = fetchedCertInfo;

    adviceResults.forEach(result => {
        adviceMap[result.errorMsg] = result.advice;
    });

    downtimeEvents.forEach(event => {
        if (adviceMap[event.msg]) {
            event.recommendation = adviceMap[event.msg];
        } else if (uniqueErrors.size > MAX_ERRORS_TO_CHECK && !adviceMap[event.msg]) {
            event.recommendation = "Advice not fetched (limit reached).";
        }
    });

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

    const groupedAnalysis = Object.keys(adviceMap).map(errorMsg => ({
        error: errorMsg,
        advice: adviceMap[errorMsg]
    }));

    return {
        id: monitorID,
        name: monitorName,
        startDate: startDate.format("YYYY-MM-DD"),
        endDate: endDate.format("YYYY-MM-DD"),
        summary: {
            uptime: uptimePercent / 100,
            avgPing: totalPingCount > 0 ? (totalPingSum / totalPingCount) : null,
            totalDowntimeDuration: formatLongDuration(totalDowntimeMs),
            totalDowntimePercent: downtimePercent.toFixed(2),
            totalUptimeDuration: formatLongDuration(totalUptimeMs),
            totalUptimePercent: uptimePercent.toFixed(2),
            downtimeCount: downtimeEvents.length,
            avgDowntime: formatDuration(avgDowntimeMs),
            mttr: formatDuration(avgDowntimeMs),
            mtbf: formatLongDuration(mtbfMs),
            maintenanceDuration: formatLongDuration(maintenanceDurationMs),
            maintenancePercent: maintenancePercent.toFixed(2) + "%",
            certInfo: certInfo
        },
        dailyStats,
        downtimeEvents,
        groupedAnalysis
    };
}


/**
 * MariaDB Report Socket Handler
 */
module.exports.mariadbReportHandler = (socket) => {
    socket.on("getDynamicReport", async (monitorID, type, year, month, week, callback) => {
        try {
            checkLogin(socket);

            let startDate; let endDate;

            if (type === "weekly") {
                const weeksAgo = week || 0;
                endDate = dayjs().subtract(weeksAgo, "week").endOf("week");
                startDate = endDate.startOf("week");
            } else {
                startDate = dayjs().year(year).month(month).startOf("month");
                endDate = startDate.endOf("month");
            }

            console.log(`Generating report for monitor ${monitorID} (${type})`);

            // Use RedBean for Monitor info
            const monitorInfo = await R.findOne("monitor", " id = ? ", [monitorID]);

            if (!monitorInfo) {
                throw new Error("Monitor not found");
            }

            const isGroup = monitorInfo.type === "group";
            const monitorName = monitorInfo.name;

            if (isGroup) {
                console.log(`Monitor ${monitorID} is a Group. Fetching children...`);

                // Get Children via Monitor Model
                const childrenIDs = await Monitor.getAllChildrenIDs(monitorID);
                console.log(`Found children: ${childrenIDs.join(", ")}`);

                // PARALLEL: Fetch all child reports concurrently
                const childrenReports = await Promise.all(
                    childrenIDs.map(childID => generateSingleMonitorStats(childID, startDate, endDate))
                );

                // Aggregate Summary (Simple averaging for now, or just pass children)
                // We'll calculate a "Group Uptime" based on average of children uptimes
                let totalUptimeSum = 0;
                childrenReports.forEach(r => totalUptimeSum += r.summary.uptime);
                const groupAvgUptime = childrenReports.length > 0 ? totalUptimeSum / childrenReports.length : 0;

                callback({
                    ok: true,
                    isGroup: true,
                    groupName: monitorName,
                    startDate: startDate.format("YYYY-MM-DD"),
                    endDate: endDate.format("YYYY-MM-DD"),
                    groupChildren: childrenReports,
                    summary: {
                        uptime: groupAvgUptime
                    }
                });

            } else {
                // Single Monitor
                const report = await generateSingleMonitorStats(monitorID, startDate, endDate);
                callback({
                    ok: true,
                    isGroup: false,
                    ...report
                });
            }

        } catch (e) {
            console.error("Report generation error:", e);
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
