const mysql = require("mysql2/promise");

/**
 * List all monitors in the database
 * Usage: node server/list-monitors.js
 */

const DB_CONFIG = {
    host: "localhost",
    user: "kuma",
    password: "secret",
    database: "kuma"
};

async function listMonitors() {
    let connection;

    try {
        connection = await mysql.createConnection(DB_CONFIG);
        console.log("✓ Connected to MariaDB database\n");

        const [monitors] = await connection.execute(
            "SELECT id, name, url, type, active FROM monitor ORDER BY id"
        );

        if (monitors.length === 0) {
            console.log("No monitors found in database");
            return;
        }

        console.log("📋 MONITORS IN DATABASE");
        console.log("─".repeat(80));
        console.log("ID  | Name                    | URL                                    | Active");
        console.log("─".repeat(80));

        monitors.forEach(m => {
            const id = String(m.id).padEnd(3);
            const name = (m.name || '').substring(0, 23).padEnd(23);
            const url = (m.url || '').substring(0, 38).padEnd(38);
            const active = m.active ? '✓' : '✗';
            console.log(`${id} | ${name} | ${url} | ${active}`);
        });

        console.log("─".repeat(80));
        console.log(`Total monitors: ${monitors.length}\n`);

    } catch (error) {
        console.error("✗ Error:", error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

listMonitors();
