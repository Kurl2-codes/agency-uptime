const { checkLogin } = require("../util-server");
const { R } = require("redbean-node");
const dayjs = require("dayjs");

/**
 * Weekly Report Socket Handler
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.weeklyReportSocketHandler = (socket) => {
    socket.on("getWeeklyReport", async (monitorID, weeksAgo, callback) => {
        try {
            checkLogin(socket);

            // Calculate date range for the week
            const endDate = dayjs().subtract(weeksAgo || 0, "week").endOf("week");
            const startDate = endDate.startOf("week");

            // Query heartbeat data
            const heartbeats = await R.findAll(
                "heartbeat",
                " monitor_id = ? AND time >= ? AND time <= ? ORDER BY time ASC ",
                [
                    monitorID,
                    startDate.format("YYYY-MM-DD HH:mm:ss"),
                    endDate.format("YYYY-MM-DD HH:mm:ss")
                ]
            );

            if (heartbeats.length === 0) {
                callback({
                    ok: true,
                    uptime: 0,
                    avgPing: null,
                    totalUp: 0,
                    totalDown: 0,
                    totalChecks: 0,
                    startDate: startDate.format("YYYY-MM-DD"),
                    endDate: endDate.format("YYYY-MM-DD"),
                    dailyStats: []
                });
                return;
            }

            // Calculate statistics
            let totalChecks = heartbeats.length;
            let upChecks = 0;
            let downChecks = 0;
            let totalPing = 0;
            let pingCount = 0;

            const dailyStats = {};

            heartbeats.forEach(hb => {
                // Overall stats
                if (hb.status === 1) {
                    upChecks++;
                    if (hb.ping !== null) {
                        totalPing += hb.ping;
                        pingCount++;
                    }
                } else if (hb.status === 0) {
                    downChecks++;
                }

                // Daily stats
                const day = dayjs(hb.time).format("YYYY-MM-DD");
                if (!dailyStats[day]) {
                    dailyStats[day] = {
                        date: day,
                        up: 0,
                        down: 0,
                        total: 0,
                        pingSum: 0,
                        pingCount: 0
                    };
                }
                dailyStats[day].total++;
                if (hb.status === 1) {
                    dailyStats[day].up++;
                    if (hb.ping !== null) {
                        dailyStats[day].pingSum += hb.ping;
                        dailyStats[day].pingCount++;
                    }
                } else {
                    dailyStats[day].down++;
                }
            });

            const uptimePercentage = (upChecks / totalChecks);
            const avgPing = pingCount > 0 ? totalPing / pingCount : null;

            // Convert daily stats to array with calculated values
            const dailyStatsArray = Object.keys(dailyStats).sort().map(day => {
                const stats = dailyStats[day];
                return {
                    date: day,
                    uptime: stats.up / stats.total,
                    avgPing: stats.pingCount > 0 ? stats.pingSum / stats.pingCount : null,
                    checks: stats.total,
                    up: stats.up,
                    down: stats.down
                };
            });

            callback({
                ok: true,
                uptime: uptimePercentage,
                avgPing,
                totalUp: upChecks,
                totalDown: downChecks,
                totalChecks,
                startDate: startDate.format("YYYY-MM-DD"),
                endDate: endDate.format("YYYY-MM-DD"),
                dailyStats: dailyStatsArray
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
