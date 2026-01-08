const { checkLogin } = require("../util-server");
const { R } = require("redbean-node");
const dayjs = require("dayjs");

/**
 * Report Socket Handler
 * @param {Socket} socket Socket.io instance
 * @returns {void}
 */
module.exports.reportSocketHandler = (socket) => {
    socket.on("getServiceAvailabilityReport", async (monitorID, year, month, week, callback) => {
        try {
            checkLogin(socket);

            let startDate, endDate;

            if (week !== null && week !== undefined) {
                // If week is provided, calculate start and end of that specific week in the month
                // First day of the month
                const firstDayOfMonth = dayjs().year(year).month(month).startOf("month");
                // Start of the week (assuming ISO week or simply 7-day blocks)
                // Uptime Kuma uses dayjs. We'll find the week start.
                startDate = firstDayOfMonth.add(week, "week").startOf("week");
                endDate = startDate.endOf("week");

                // Ensure we don't go out of the month's bounds too much if that's preferred
                // But usually weekly report means that week.
            } else {
                // Monthly report
                startDate = dayjs().year(year).month(month).startOf("month");
                endDate = startDate.endOf("month");
            }

            const startTimestamp = startDate.unix();
            const endTimestamp = endDate.unix();

            // Query stat_daily for the range
            // stat_daily.timestamp is Unix timestamp rounded down to the nearest day
            const stats = await R.findAll("stat_daily", " monitor_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC ", [
                monitorID,
                startTimestamp,
                endTimestamp,
            ]);

            let totalUp = 0;
            let totalDown = 0;
            let totalPingSum = 0;
            let totalPingCount = 0;

            for (const stat of stats) {
                totalUp += stat.up;
                totalDown += stat.down;
                if (stat.up > 0) {
                    totalPingSum += (stat.ping * stat.up);
                    totalPingCount += stat.up;
                }
            }

            const uptime = (totalUp + totalDown) > 0 ? (totalUp / (totalUp + totalDown)) : 0;
            const avgPing = totalPingCount > 0 ? (totalPingSum / totalPingCount) : null;

            callback({
                ok: true,
                uptime,
                avgPing,
                totalUp,
                totalDown,
                startDate: startDate.format("YYYY-MM-DD"),
                endDate: endDate.format("YYYY-MM-DD"),
            });

        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
