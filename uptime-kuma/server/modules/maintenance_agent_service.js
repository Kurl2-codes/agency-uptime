const { R } = require("redbean-node");
const Maintenance = require("../model/maintenance");
const { log } = require("../../src/util");
const { UptimeKumaServer } = require("../uptime-kuma-server");
const { askSREAgent } = require("./sre-agent-client");

/**
 * Scans emails via SRE Agent and creates maintenance windows.
 * @returns {Promise<Object>} Result object { count, msg, debug_agent_response }
 */
async function scanAndCreateMaintenance() {
    const server = UptimeKumaServer.getInstance();

    const prompt = `
    You are an intelligent SRE Assistant. 
    Your task is to scan the email inbox for ANY maintenance-related emails.
    
    **INSTRUCTION:**
    1. Call 'scanMaintenanceEmails' ONE TIME.
    2. Analyze the result.
    3. Output the JSON.
    4. STOP. Do not call the tool again.
    
    **CRITICAL:**  
    - Process EVERY email found. Do not filter any out.
    - If an email has NO SUBJECT, analyze the BODY.
    - If "Title:" is missing, INFER a title from the first sentence (e.g. "Maintenance - [First few words]").
    
    For EACH email, EXTRACT ALL DATA possible.
    
    **CRITICAL PARSING RULES:** 
    - DO NOT REJECT EMAILS.
    - DO NOT USE 'replyToSender' unless the email is blank or spam.
    - If the format is wrong, GUESS the data.
    - If "Title" is missing, use "Maintenance - [Subject]".
    - If "Start/End" is missing, use NOW and NOW+1h.
    - If "Status Page" is missing, use "All Pages".
    - If "Affected" is missing, use "System".

    **Output Rules:**
    - Return a JSON ARRAY of objects.
    - Timezone: Asia/Manila.
    
    JSON Format:
    [
        {
            "title": "Title",
            "description": "Description",
            "start_date": "YYYY-MM-DD HH:mm:ss",
            "end_date": "YYYY-MM-DD HH:mm:ss",
            "affected_websites": ["Monitor A"],
            "status_pages": ["Shore360"]
        }
    ]
    `;

    // 1. Ask SRE Agent to get the data
    const threadId = "maintenance-scan-" + Date.now();
    const agentResponse = await askSREAgent("Scan for maintenance emails and return JSON.", threadId, prompt);
    log.info("agent-debug", "Raw Agent Response: " + agentResponse);

    // 2. Parse JSON
    let maintenanceList = [];
    try {
        // Find the JSON array in the response (in case agent adds text)
        const jsonMatch = agentResponse.match(/\[.*\]/s);
        if (jsonMatch) {
            maintenanceList = JSON.parse(jsonMatch[0]);
        } else {
            // Try parsing the whole thing
            maintenanceList = JSON.parse(agentResponse);
        }
    } catch (e) {
        // Don't throw, just return empty, maybe agent replied to email and returned text
        return {
            msg: "Agent processed emails. " + agentResponse,
            count: 0,
            debug_agent_response: agentResponse
        };
    }

    if (!Array.isArray(maintenanceList) || maintenanceList.length === 0) {
        return {
            msg: agentResponse.includes("replyToSender") ? "Invalid email found. Reply sent to sender." : "No valid maintenance emails found.",
            count: 0,
            debug_agent_response: agentResponse
        };
    }

    let createdCount = 0;

    // Fetch all monitors for matching
    const allMonitors = await R.getAll("SELECT id, name, url, type FROM monitor");

    // Fetch all Status Pages
    const allStatusPages = await R.getAll("SELECT id, title, slug FROM status_page");

    // Helper to find children of a group
    const findChildren = async (groupId) => {
        const links = await R.getAll("SELECT monitor_id FROM monitor_group WHERE group_id = ?", [groupId]);
        return links.map(l => l.monitor_id);
    };

    // 3. Create Maintenance Entries
    for (const item of maintenanceList) {
        // Basic validation in JS
        if (!item.title || !item.start_date || !item.end_date) continue;

        // Strict Validation: Must have Status Page and Affected Monitors
        const spRaw = item.status_pages || item.status_page || [];
        const hasStatusPage = Array.isArray(spRaw) ? spRaw.length > 0 : !!spRaw;

        const affRaw = item.affected_websites || item.affected_monitors || item.affected_systems || item.affected || item.monitors || [];
        const hasAffected = Array.isArray(affRaw) ? affRaw.length > 0 : !!affRaw;

        if (!hasStatusPage || !hasAffected) {
            log.warn("agent", `Skipping maintenance creation due to missing fields for '${item.title}'`);
            continue;
        }

        // Robust Duplicate Check: Query by Title
        const candidates = await R.find("maintenance", " title = ? ", [item.title]);

        const targetStart = new Date(item.start_date).getTime();

        let isDuplicate = false;
        for (const c of candidates) {
            const cStart = new Date(c.start_date).getTime();
            // Check if times are identical (or very close, within 1 minute)
            if (Math.abs(targetStart - cStart) < 60000) {
                isDuplicate = true;
                break;
            }
        }

        if (isDuplicate) {
            console.log(`Duplicate found for '${item.title}'. Skipping.`);
            continue;
        }

        // Create Object for Model
        const maintenanceObj = {
            title: item.title,
            description: item.description || "Auto-created from email.",
            strategy: "single",
            active: true,
            timezoneOption: "SAME_AS_SERVER",
            dateRange: [item.start_date, item.end_date],
            intervalDay: 1,
            timeRange: [],
            weekdays: [],
            daysOfMonth: []
        };

        // Use RedBean + Model
        let bean = await Maintenance.jsonToBean(R.dispense("maintenance"), maintenanceObj);
        bean.user_id = 1; // Admin

        const maintenanceID = await R.store(bean);

        // Activate it
        server.maintenanceList[maintenanceID] = bean;
        await bean.run(true);

        // --- MATCH STATUS PAGES ---
        const spListRaw = item.status_pages || item.status_page || [];
        const spList = Array.isArray(spListRaw) ? spListRaw : [spListRaw];

        for (const spName of spList) {
            const term = spName.replace(/^[-\s*•]+/, "").trim().toLowerCase();
            if (!term) continue;

            const matchedSP = allStatusPages.find(sp => {
                const title = sp.title.toLowerCase();
                const slug = sp.slug?.toLowerCase() || "";
                return title.includes(term) || term.includes(title) ||
                    (slug && (slug.includes(term) || term.includes(slug)));
            });

            if (matchedSP) {
                const existing = await R.findOne("maintenance_status_page", "maintenance_id = ? AND status_page_id = ?", [maintenanceID, matchedSP.id]);
                if (!existing) {
                    let spBean = R.dispense("maintenance_status_page");
                    spBean.status_page_id = matchedSP.id;
                    spBean.maintenance_id = maintenanceID;
                    await R.store(spBean);
                }
            }
        }

        // --- MATCH MONITORS ---
        const monList = Array.isArray(affRaw) ? affRaw : [affRaw];

        for (const mName of monList) {
            const term = mName.replace(/^[-\s*•]+/, "").trim().toLowerCase();
            if (!term) continue;

            const matchedMonitor = allMonitors.find(m => {
                const name = m.name?.toLowerCase() || "";
                const url = m.url?.toLowerCase() || "";
                return name.includes(term) || term.includes(name) || url.includes(term) || term.includes(url);
            });

            if (matchedMonitor) {
                const monitorIdsToLink = new Set();
                monitorIdsToLink.add(matchedMonitor.id);

                if (matchedMonitor.type === "group") {
                    const childrenIds = await findChildren(matchedMonitor.id);
                    childrenIds.forEach(id => monitorIdsToLink.add(id));
                }

                for (const mId of monitorIdsToLink) {
                    const existing = await R.findOne("monitor_maintenance", "maintenance_id = ? AND monitor_id = ?", [maintenanceID, mId]);
                    if (!existing) {
                        let linkBean = R.dispense("monitor_maintenance");
                        linkBean.monitor_id = mId;
                        linkBean.maintenance_id = maintenanceID;
                        await R.store(linkBean);
                    }
                }
            }
        }

        // Refresh Cache Entry logic
        server.maintenanceList[maintenanceID] = bean;
        createdCount++;
    }

    // Force Broadcast to ALL clients (Global System Notification)
    const adminList = await server.getMaintenanceJSONList(1);
    server.io.emit("maintenanceList", adminList);

    return {
        ok: true,
        msg: `Scanned emails. Created ${createdCount} maintenance windows.`,
        count: createdCount,
        debug_agent_response: agentResponse
    };
}

module.exports = {
    scanAndCreateMaintenance
};
