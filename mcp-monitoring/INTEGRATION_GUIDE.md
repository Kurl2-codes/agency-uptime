# Integration Guide: Uptime Kuma (Node.js) -> SRE Agent

This guide explains how to connect your **Uptime Kuma (Node.js)** backend to the **SRE Agent (Python)**.

## Architecture
- **SRE Agent**: Runs on `http://localhost:8000`. Listens for `POST /chat`.
- **Uptime Kuma**: Acts as the client. It sends monitor data or specific questions to the Agent and displays/logs the response.

## Integration Code (Node.js)

You can add this function to your Uptime Kuma backend (e.g., in a notification provider or a specific server route) to get reasoning from the agent.

```javascript
/**
 * Ask the SRE Agent for reasoning.
 * @param {string} message - The question or monitor error details.
 * @param {string} threadId - Unique ID for the conversation context (optional).
 * @returns {Promise<string>} - The agent's reasoning.
 */
async function askSREAgent(message, threadId = "system") {
    const AGENT_URL = "http://127.0.0.1:8000/chat";

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

// --- Example Usage ---
// Call this when a monitor goes DOWN
/*
const monitorName = "Google Production";
const errorMsg = "502 Bad Gateway";
const prompt = `Monitor '${monitorName}' is DOWN with error: '${errorMsg}'. What should I check?`;

askSREAgent(prompt).then(answer => {
    console.log("Generated this report on node");
    console.log("SRE Agent Advice:", answer);
});

// --- Example: Check Domain Expiry ---
/*
const domainPrompt = "Check if chesteralba.com is expiring soon";
askSREAgent(domainPrompt, "domain_check_1").then(answer => {
    console.log("Domain Check Result:", answer);
});
*/
```

## Setup Steps

1.  **Ensure Python Agent is Running**:
    ```bash
    # In the 'mcp-monitoring' folder
    python src/api.py
    ```

2.  **Add the Code**: Copy the `askSREAgent` function into your Node.js application logic.

3.  **Test**: Trigger the function and check your console/logs for the Agent's advice.
