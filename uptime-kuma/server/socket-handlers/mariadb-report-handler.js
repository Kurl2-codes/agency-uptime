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


/**
 * Format Duration helper
 */
const formatDuration = (ms) => {
    if (ms === 0) {
        return "0s";
    }
    if (ms < 1000) {
        return `${Math.floor(ms)}ms`;
    }

    // Calculate total seconds
    const totalSec = Math.floor(ms / 1000);

    if (totalSec < 60) {
        return `${totalSec}s`;
    }

    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60; // Remainder seconds

    if (min < 60) {
        if (sec === 0) {
            return `${min}m`;
        }
        return `${min}m ${sec}s`;
    }

    const hrs = Math.floor(min / 60);
    const rmMin = min % 60;

    // For long durations
    if (sec === 0) {
        return `${hrs}h ${rmMin}m`;
    }
    return `${hrs}h ${rmMin}m ${sec}s`;
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

const path = require("path");
const fs = require("fs");

// SRE Advice Cache
let adviceCache = {};
const CACHE_FILE = path.join(process.env.DATA_DIR || "./data", "sre-advice-cache.json");

// Load Cache on Module Load
try {
    if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");
        adviceCache = JSON.parse(raw);
        console.log(`[SRE Cache] Loaded ${Object.keys(adviceCache).length} entries from disk.`);
    }
} catch (err) {
    console.error("[SRE Cache] Failed to load cache:", err);
}

/**
 * Save Cache to Disk
 */
function saveCache() {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(adviceCache, null, 2));
    } catch (err) {
        console.error("[SRE Cache] Failed to save cache:", err);
    }
}

const MAX_CACHE_SIZE = 500; // Increased size since it's on disk now


/**
 * Ask the SRE Agent for reasoning.
 * @param {string} message - The question or monitor error details.
 * @param {string} threadId - Unique ID for the conversation context (optional).
 * @returns {Promise<string>} - The agent's reasoning.
 */
async function askSREAgent(message, threadId = "system") {
    const AGENT_URL = process.env.MCP_AGENT_URL || "http://127.0.0.1:8000/chat";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 Second Timeout

    try {
        const response = await fetch(AGENT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: message,
                thread_id: threadId
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Agent API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response;

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error("SRE Agent request timed out.");
            return "Analysis timed out (Agent unresponsive).";
        }
        console.error("Failed to talk to SRE Agent:", error);
        return "⚠️ SRE Agent is unreachable.";
    }
}

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
                pingCount: 0,
                uptime: 0,      // Will be calculated by time
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
            const msg = hb.msg || "Unspecified Check Failure";

            if (!currentDowntime) {
                currentDowntime = {
                    startTime: hb.time,
                    endTime: null,
                    msg: msg,
                    recommendation: "Fetching advice..."
                };
            } else if (msg !== "Unspecified Check Failure" && currentDowntime.msg === "Unspecified Check Failure") {
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
        // Fix: If endDate is in the future (e.g. End of Week report), clamp ongoing downtime to NOW.
        // This prevents showing future downtime (e.g. "91 Hrs") for an active incident.
        const now = dayjs();
        let effectiveEnd = endDate;
        if (effectiveEnd.isAfter(now)) {
            effectiveEnd = now;
        }

        currentDowntime.endTime = effectiveEnd.format("YYYY-MM-DD HH:mm:ss");
        currentDowntime.duration = dayjs(currentDowntime.endTime).diff(dayjs(currentDowntime.startTime));

        if (currentDowntime.duration < 0) currentDowntime.duration = 0;

        downtimeEvents.push(currentDowntime);
    }
    if (currentMaintenance) {
        // Same clamp for maintenance
        const now = dayjs();
        let effectiveEnd = endDate;
        if (effectiveEnd.isAfter(now)) {
            effectiveEnd = now;
        }
        maintenanceDurationMs += effectiveEnd.diff(dayjs(currentMaintenance));
    }

    // Calculate Metrics
    let totalDowntimeMs = 0;
    const uniqueErrors = new Set();
    const maintenanceEvents = []; // Need to track maintenance for daily overlap too

    // Re-process for daily stats (Time-Based Calculation)
    // We need to calculate how much downtime/maintenance occurred within each day
    // to get an accurate daily uptime percentage.

    // Helper: Calculate overlap in milliseconds between two ranges
    const getOverlap = (start1, end1, start2, end2) => {
        const s = Math.max(start1, start2);
        const e = Math.min(end1, end2);
        return Math.max(0, e - s);
    };

    const dailyStats = Object.values(dailyStatsMap).sort((a, b) => a.date.localeCompare(b.date)).map(dayStat => {
        const dayStart = dayjs(dayStat.date).startOf('day').valueOf();
        const dayEnd = dayjs(dayStat.date).endOf('day').valueOf();

        // Clamp day window to report range
        const windowStart = Math.max(dayStart, startDate.valueOf());
        const windowEnd = Math.min(dayEnd, endDate.valueOf());
        const totalWindowMs = Math.max(0, windowEnd - windowStart);

        let dayDowntimeMs = 0;
        let dayMaintenanceMs = 0;

        // Calculate Downtime overlap for this day
        downtimeEvents.forEach(evt => {
            const evtStart = dayjs(evt.startTime).valueOf();
            const evtEnd = dayjs(evt.endTime).valueOf();
            dayDowntimeMs += getOverlap(windowStart, windowEnd, evtStart, evtEnd);
        });

        // Calculate Downtime overlap for this day
        // Note: For pure accuracy, maintenance should also be time-based.
        // But since we didn't track maintenance objects fully in the loop above (only currentMaintenance),
        // we will stick to the requested fix for "Check Failure" availability logic first.

        const dayUptimeMs = Math.max(0, totalWindowMs - dayDowntimeMs);
        const calcUptime = totalWindowMs > 0 ? (dayUptimeMs / totalWindowMs) : 0;

        return {
            date: dayStat.date,
            uptime: calcUptime, // Time-based!
            avgPing: dayStat.pingCount > 0 ? (dayStat.pingSum / dayStat.pingCount) : null,
            checks: dayStat.total,
            up: dayStat.up,
            down: dayStat.down,
            maintenance: dayStat.maintenance
        };
    });

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
    const MAX_ERRORS_TO_CHECK = 3;
    const errorsArray = Array.from(uniqueErrors).slice(0, MAX_ERRORS_TO_CHECK);
    const adviceMap = {};

    // SEQUENTIAL: Fetch advice for unique errors one by one to avoid local LLM overload
    const adviceResults = [];

    for (const errorMsg of errorsArray) {
        // 1. Check Cache
        if (adviceCache[errorMsg]) {
            console.log(`[Report] Serving cached advice for: "${errorMsg}"`);
            adviceResults.push({ errorMsg, advice: adviceCache[errorMsg] });
            continue;
        }

        const exampleEvent = downtimeEvents.find(e => e.msg === errorMsg);
        const durationContext = exampleEvent ? exampleEvent.durationStr : "unknown";

        const prompt = `
            You are a Site Reliability Engineer (SRE) Agent.
            I encountered a monitor error: "${errorMsg}".
            
            Context:
            - Monitor Name: "${monitorName}"
            - Target URL: "${monitorUrl}"
            - Downtime Duration: ${durationContext}

            Please provide a concise analysis in two parts:
            1. <b>Reasoning:</b> Brief technical explanation of why this error occurred.
            2. <b>Recommendation:</b> Actionable steps to fix it.
            IMPORTANT: Format the recommendations as an HTML unordered list (<ul><li>...</li></ul>).
            Do NOT use Markdown (no * or -). Use only HTML tags.
        `.trim().replace(/\s+/g, " ");

        try {
            console.log(`[Report] Fetching fresh advice for: "${errorMsg}"`);
            const advice = await askSREAgent(prompt, `monitor-${monitorID}`);

            // Simple Sanitization
            const safeAdvice = advice
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                .replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gim, "")
                .replace(/\bon\w+="[^"]*"/gim, "");

            // 2. Store in Cache (Limit size)
            if (Object.keys(adviceCache).length >= MAX_CACHE_SIZE) {
                for (const key in adviceCache) delete adviceCache[key];
            }
            adviceCache[errorMsg] = safeAdvice;
            adviceResults.push({ errorMsg, advice: safeAdvice });

        } catch (err) {
            console.error(`Failed to get advice for ${errorMsg}:`, err);
            adviceResults.push({ errorMsg, advice: "SRE Agent is unreachable (Timeout)." });
        }
    }

    const fetchedCertInfo = await certInfoPromise;

    // Save cache if any new advice was fetched
    if (adviceResults.some(r => r.advice && r.advice !== "Analysis failed." && r.advice !== "Advice not fetched (limit reached).")) {
        saveCache();
    }

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

    const groupedAnalysis = Object.keys(adviceMap).map(errorMsg => {
        const exampleEvent = downtimeEvents.find(e => e.msg === errorMsg);
        return {
            error: errorMsg,
            advice: adviceMap[errorMsg],
            duration: exampleEvent ? exampleEvent.durationStr : "unknown"
        };
    });

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

                // SEQUENTIAL: Fetch all child reports one by one to prevent global SRE overload
                const childrenReports = [];
                for (const childID of childrenIDs) {
                    const report = await generateSingleMonitorStats(childID, startDate, endDate);
                    childrenReports.push(report);
                }

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

    socket.on("retryAnalysis", async (monitorID, errorMsg, durationContext, callback) => {
        try {
            checkLogin(socket);

            console.log(`[Report] Retrying analysis for: "${errorMsg}"`);

            const monitor = await R.findOne("monitor", " id = ? ", [monitorID]);
            let monitorName = "Unknown Monitor";
            let monitorUrl = "";

            if (monitor) {
                monitorName = monitor.name;
                monitorUrl = monitor.url || monitor.hostname;
            }

            const prompt = `
                You are a Site Reliability Engineer (SRE) Agent.
                I encountered a monitor error: "${errorMsg}".
                
                Context:
                - Monitor Name: "${monitorName}"
                - Target URL: "${monitorUrl}"
                - Downtime Duration: ${durationContext}

                Please provide a concise analysis in two parts:
                1. <b>Reasoning:</b> Brief technical explanation of why this error occurred.
                2. <b>Recommendation:</b> Actionable steps to fix it.
                IMPORTANT: Format the recommendations as an HTML unordered list (<ul><li>...</li></ul>).
                Do NOT use Markdown (no * or -). Use only HTML tags.
            `.trim().replace(/\s+/g, " ");

            const advice = await askSREAgent(prompt, `retry-${monitorID}`);

            // Simple Sanitization
            const safeAdvice = advice
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                .replace(/<iframe\b[^>]*>([\s\S]*?)<\/iframe>/gim, "")
                .replace(/\bon\w+="[^"]*"/gim, "");

            // Update Cache
            adviceCache[errorMsg] = safeAdvice;
            saveCache();

            callback({
                ok: true,
                advice: safeAdvice
            });

        } catch (e) {
            console.error("Retry analysis error:", e);
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
