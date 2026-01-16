// Native fetch is available in Node 18+

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

module.exports = {
    askSREAgent
};
