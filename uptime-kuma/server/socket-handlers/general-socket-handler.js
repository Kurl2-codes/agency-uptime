const { log } = require("../../src/util");
const { Settings } = require("../settings");
const { sendInfo } = require("../client");
const { checkLogin } = require("../util-server");
const GameResolver = require("gamedig/lib/GameResolver");
const { testChrome } = require("../monitor-types/real-browser-monitor-type");
const fsAsync = require("fs").promises;
const path = require("path");

let gameResolver = new GameResolver();
let gameList = null;

/**
 * Get a game list via GameDig
 * @returns {object[]} list of games supported by GameDig
 */
function getGameList() {
    if (gameList == null) {
        gameList = gameResolver._readGames().games.sort((a, b) => {
            if (a.pretty < b.pretty) {
                return -1;
            }
            if (a.pretty > b.pretty) {
                return 1;
            }
            return 0;
        });
    }
    return gameList;
}

/**
 * Handler for general events
 * @param {Socket} socket Socket.io instance
 * @param {UptimeKumaServer} server Uptime Kuma server
 * @returns {void}
 */
module.exports.generalSocketHandler = (socket, server) => {
    socket.on("initServerTimezone", async (timezone) => {
        try {
            checkLogin(socket);
            log.debug("generalSocketHandler", "Timezone: " + timezone);
            await Settings.set("initServerTimezone", true);
            await server.setTimezone(timezone);
            await sendInfo(socket);
        } catch (e) {
            log.warn("initServerTimezone", e.message);
        }
    });

    socket.on("getGameList", async (callback) => {
        try {
            checkLogin(socket);
            callback({
                ok: true,
                gameList: getGameList(),
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    socket.on("testChrome", (executable, callback) => {
        try {
            checkLogin(socket);
            // Just noticed that await call could block the whole socket.io server!!! Use pure promise instead.
            testChrome(executable).then((version) => {
                callback({
                    ok: true,
                    msg: {
                        key: "foundChromiumVersion",
                        values: [version],
                    },
                    msgi18n: true,
                });
            }).catch((e) => {
                callback({
                    ok: false,
                    msg: e.message,
                });
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    socket.on("getPushExample", async (language, callback) => {
        try {
            checkLogin(socket);
            if (!/^[a-z-]+$/.test(language)) {
                throw new Error("Invalid language");
            }
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
            return;
        }

        try {
            let dir = path.join("./extra/push-examples", language);
            let files = await fsAsync.readdir(dir);

            for (let file of files) {
                if (file.startsWith("index.")) {
                    callback({
                        ok: true,
                        code: await fsAsync.readFile(path.join(dir, file), "utf8"),
                    });
                    return;
                }
            }
        } catch (e) {

        }

        callback({
            ok: false,
            msg: "Not found",
        });
    });


    socket.on("getQuickStats", async (callback) => {
        try {
            checkLogin(socket);

            // 1. Monitor Count (Active only)
            const monitorList = server.monitorList;

            let activeMonitors = Object.values(monitorList).filter(m => {
                return m.active;
            });
            const monitorCount = activeMonitors.length;

            // 1b. Group Count & Uptime (Agency Performance = Avg Uptime of Groups)
            let activeGroups = activeMonitors.filter(m => m.type === "group");
            const groupCount = activeGroups.length;

            // 2. Global Uptime (All Monitors)
            let totalGlobalUptime = 0;
            let globalUptimeCount = 0;

            // 3. Client Uptime (Groups)
            let totalGroupUptime = 0;
            let groupUptimeCount = 0;

            const { UptimeCalculator } = require("../uptime-calculator");

            // Calculate Global
            for (const monitor of activeMonitors) {
                try {
                    const calc = await UptimeCalculator.getUptimeCalculator(monitor.id);
                    const data = calc.getData(1440, "minute");
                    totalGlobalUptime += data.uptime;
                    globalUptimeCount++;
                } catch (e) {
                    log.error("getQuickStats", `Failed to calc global uptime for ${monitor.id}: ${e.message}`);
                }
            }
            const globalUptime = globalUptimeCount > 0 ? (totalGlobalUptime / globalUptimeCount) : 0;

            // Calculate Group
            if (groupCount > 0) {
                for (const monitor of activeGroups) {
                    try {
                        const calc = await UptimeCalculator.getUptimeCalculator(monitor.id);
                        const data = calc.getData(1440, "minute");
                        totalGroupUptime += data.uptime;
                        groupUptimeCount++;
                    } catch (e) {
                        log.error("getQuickStats", `Failed to calc group uptime for ${monitor.id}: ${e.message}`);
                    }
                }
            }
            const groupUptime = groupUptimeCount > 0 ? (totalGroupUptime / groupUptimeCount) : 0;

            // 3. Downtime Resolution (MTTR) - Last 30 Days
            // Query important heartbeats (status changes)
            const { R } = require("redbean-node");
            const dayjs = require("dayjs");

            const thirtyDaysAgo = dayjs().subtract(30, "day").format("YYYY-MM-DD HH:mm:ss");

            // Get all important heartbeats in the last 30 days
            // Status: 0 (DOWN), 1 (UP)
            const heartbeats = await R.getAll(`
                SELECT monitor_id, status, time 
                FROM heartbeat 
                WHERE important = 1 
                AND time > ? 
                ORDER BY monitor_id, time ASC
            `, [thirtyDaysAgo]);

            const calcMTTR = (relevantHeartbeats) => {
                let totalDowntimeDuration = 0;
                let resolvedIncidents = 0;
                let pendingDowntimes = {};

                for (const hb of relevantHeartbeats) {
                    const monitorID = hb.monitor_id;
                    const time = dayjs(hb.time);
                    const status = hb.status;

                    if (status === 0) { // DOWN
                        if (!pendingDowntimes[monitorID]) {
                            pendingDowntimes[monitorID] = time;
                        }
                    } else if (status === 1) { // UP
                        if (pendingDowntimes[monitorID]) {
                            const downTime = pendingDowntimes[monitorID];
                            const durationSeconds = time.diff(downTime, "second");

                            totalDowntimeDuration += durationSeconds;
                            resolvedIncidents++;

                            delete pendingDowntimes[monitorID];
                        }
                    }
                }
                return resolvedIncidents > 0 ? Math.round(totalDowntimeDuration / resolvedIncidents) : 0; // in seconds
            };

            const mttr = calcMTTR(heartbeats);

            // 4. Per Group Stats (Uptime & MTTR)
            const groupsData = [];
            if (groupCount > 0) {
                for (const group of activeGroups) {
                    // Identify children (monitors with parent = group.id)
                    // Note: This relies on in-memory monitorList having correct parent info.
                    // activeMonitors is derived from server.monitorList which should have it.
                    // We need to check ALL monitors (active or paused) for children? 
                    // Usually we only care about Active children for uptime.
                    // But for MTTR we might care about all? Let's stick to Active for now for consistency.
                    const children = activeMonitors.filter(m => m.parent === group.id);
                    const childrenIDs = children.map(m => m.id);

                    // Uptime
                    let groupTotalUptime = 0;
                    let groupUptimeCalcCount = 0;

                    for (const child of children) {
                        try {
                            const calc = await UptimeCalculator.getUptimeCalculator(child.id);
                            const data = calc.getData(1440, "minute");
                            groupTotalUptime += data.uptime;
                            groupUptimeCalcCount++;
                        } catch (e) { }
                    }
                    const avgUptime = groupUptimeCalcCount > 0 ? (groupTotalUptime / groupUptimeCalcCount) : 0;

                    // MTTR
                    const groupHeartbeats = heartbeats.filter(hb => childrenIDs.includes(hb.monitor_id));
                    const groupMttr = calcMTTR(groupHeartbeats);

                    groupsData.push({
                        id: group.id,
                        name: group.name,
                        uptime: avgUptime,
                        mttr: groupMttr,
                        monitorCount: children.length
                    });
                }
            }

            callback({
                ok: true,
                data: {
                    monitorCount,
                    groupCount,
                    agencyPerformance: globalUptime,
                    groupUptime,
                    mttr,
                    groupsData, // New: List of groups with specific stats
                }
            });

        } catch (e) {
            log.error("getQuickStats", e);
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });

    // Disconnect all other socket clients of the user
    socket.on("disconnectOtherSocketClients", async () => {
        try {
            checkLogin(socket);
            server.disconnectAllSocketClients(socket.userID, socket.id);
        } catch (e) {
            log.warn("disconnectAllSocketClients", e.message);
        }
    });
};
