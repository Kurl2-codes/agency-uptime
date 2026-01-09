const mysql = require("mysql2/promise");
const dayjs = require("dayjs");

/**
 * Generate Weekly Report from Heartbeat Table
 * Usage: node server/generate-weekly-report.js [monitor_url] [weeks_ago]
 * Example: node server/generate-weekly-report.js "https://google.com" 0
 */

const DB_CONFIG = {
    host: "localhost",
    user: "kuma",
    password: "secret",
    database: "kuma"
};

/**
 * @param monitorUrl
 * @param weeksAgo
 */
async function generateWeeklyReport(monitorUrl, weeksAgo = 0) {
    let connection;

    try {
        // Connect to database
        connection = await mysql.createConnection(DB_CONFIG);
        console.log("✓ Connected to MariaDB database");

        // Find monitor by URL
        const [ monitors ] = await connection.execute(
            "SELECT id, name, url FROM monitor WHERE url = ?",
            [ monitorUrl ]
        );

        if (monitors.length === 0) {
            console.error(`✗ No monitor found with URL: ${monitorUrl}`);
            process.exit(1);
        }

        const monitor = monitors[0];
        console.log(`✓ Found monitor: ${monitor.name} (ID: ${monitor.id})`);

        // Calculate date range for the week
        const endDate = dayjs().subtract(weeksAgo, "week").endOf("week");
        const startDate = endDate.startOf("week");

        console.log(`\n📅 Report Period: ${startDate.format("YYYY-MM-DD")} to ${endDate.format("YYYY-MM-DD")}`);
        console.log("─".repeat(60));

        // Query heartbeat data
        const [ heartbeats ] = await connection.execute(
            `SELECT 
                status,
                ping,
                time
             FROM heartbeat 
             WHERE monitor_id = ? 
             AND time >= ? 
             AND time <= ?
             ORDER BY time ASC`,
            [
                monitor.id,
                startDate.format("YYYY-MM-DD HH:mm:ss"),
                endDate.format("YYYY-MM-DD HH:mm:ss")
            ]
        );

        if (heartbeats.length === 0) {
            console.log("⚠ No heartbeat data found for this period");
            return;
        }

        // Calculate statistics
        let totalChecks = heartbeats.length;
        let upChecks = 0;
        let downChecks = 0;
        let totalPing = 0;
        let pingCount = 0;

        heartbeats.forEach(hb => {
            if (hb.status === 1) {
                upChecks++;
                if (hb.ping !== null) {
                    totalPing += hb.ping;
                    pingCount++;
                }
            } else if (hb.status === 0) {
                downChecks++;
            }
        });

        const uptimePercentage = (upChecks / totalChecks) * 100;
        const avgPing = pingCount > 0 ? totalPing / pingCount : 0;

        // Display report
        console.log("\n📊 WEEKLY AVAILABILITY REPORT");
        console.log("─".repeat(60));
        console.log(`Monitor Name:        ${monitor.name}`);
        console.log(`Monitor URL:         ${monitor.url}`);
        console.log(`Monitor ID:          ${monitor.id}`);
        console.log("");
        console.log(`Total Checks:        ${totalChecks}`);
        console.log(`Up Checks:           ${upChecks}`);
        console.log(`Down Checks:         ${downChecks}`);
        console.log("");
        console.log(`Uptime:              ${uptimePercentage.toFixed(3)}%`);
        console.log(`Avg Response Time:   ${avgPing > 0 ? avgPing.toFixed(2) + " ms" : "N/A"}`);
        console.log("─".repeat(60));

        // Daily breakdown
        console.log("\n📈 DAILY BREAKDOWN");
        console.log("─".repeat(60));

        const dailyStats = {};
        heartbeats.forEach(hb => {
            const day = dayjs(hb.time).format("YYYY-MM-DD");
            if (!dailyStats[day]) {
                dailyStats[day] = { up: 0,
                    down: 0,
                    total: 0,
                    pingSum: 0,
                    pingCount: 0 };
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

        Object.keys(dailyStats).sort().forEach(day => {
            const stats = dailyStats[day];
            const dayUptime = (stats.up / stats.total) * 100;
            const dayAvgPing = stats.pingCount > 0 ? stats.pingSum / stats.pingCount : 0;
            console.log(`${day}  |  Uptime: ${dayUptime.toFixed(2)}%  |  Avg Ping: ${dayAvgPing > 0 ? dayAvgPing.toFixed(2) + " ms" : "N/A"}  |  Checks: ${stats.total}`);
        });
        console.log("─".repeat(60));

    } catch (error) {
        console.error("✗ Error generating report:", error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log("\n✓ Database connection closed");
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const monitorUrl = args[0];
const weeksAgo = parseInt(args[1]) || 0;

if (!monitorUrl) {
    console.log("Usage: node server/generate-weekly-report.js [monitor_url] [weeks_ago]");
    console.log("");
    console.log("Examples:");
    console.log("  node server/generate-weekly-report.js \"https://google.com\" 0    # Current week");
    console.log("  node server/generate-weekly-report.js \"https://google.com\" 1    # Last week");
    console.log("  node server/generate-weekly-report.js \"https://google.com\" 2    # 2 weeks ago");
    process.exit(1);
}

generateWeeklyReport(monitorUrl, weeksAgo);
