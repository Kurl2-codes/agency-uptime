/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable("maintenance_agent_prompt", function (table) {
        table.increments("id");
        table.text("prompt", "longtext");
        table.datetime("updated_at");
    }).then(() => {
        return knex("maintenance_agent_prompt").insert({
            prompt: `You are an intelligent SRE Assistant. 
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
]`,
            updated_at: knex.fn.now(),
        });
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTable("maintenance_agent_prompt");
};
