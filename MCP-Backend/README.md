# SRE Monitoring Assistant (MCP + LangGraph)

A professional Site Reliability Engineer (SRE) chatbot powered by LangGraph, OpenAI, and Uptime Kuma MCP. It allows you to monitor your services, analyze downtime, and generate reports via CLI or REST API.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Python 3.12+**
- **Node.js & npm** (to run the MCP server)
- **OpenAI API Key**
- **MariaDB** (if using Uptime Kuma with MariaDB backend)

### 2. Installation
First, ensure you have a virtual environment set up and all dependencies installed:

```powershell
# Create virtual environment (if not already done)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install required packages
pip install -r requirements.txt
```

### 3. Configuration
## 🚀 Getting Started (Team Fast Track)

For the easiest setup, use the included wizard:
1.  **Run the Setup Script**:
    ```bash
    python setup_wizard.py
    ```
    *This generates your `.env` and config files automatically.*

2.  **Run with Docker**:
    ```bash
    docker-compose up -d --build
    ```

### Manual Configuration (If needed)
1. **`.env`**: Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_key_here
   
   # MariaDB Connection (for historical data)
   DB_HOST=localhost
   DB_USER=kuma
   DB_PASSWORD=secret
   DB_NAME=kuma
   ```

2. **`mcp_server_config.json`**: Ensure your Uptime Kuma credentials are correct:
   ```json
   {
     "mcpServers": {
       "uptime-kuma": {
         "command": "npx.cmd",
         "args": ["@davidfuchs/mcp-uptime-kuma"],
         "env": {
           "UPTIME_KUMA_URL": "http://your-uptime-kuma-url",
           "UPTIME_KUMA_USERNAME": "your_username",
           "UPTIME_KUMA_PASSWORD": "your_password"
         }
       }
     }
   }
   ```

---

## 🛠️ How to Use

There are **two ways** to use the SRE Assistant:

### 1. Interactive CLI (The "Chat Bot")
This is a standalone terminal application. It has a beautiful UI with tables and spinners.
- **Run this**: `python src/agent.py`
- **Use case**: When you want to chat directly in your command prompt.

### 2. REST API (The "Backend Service")
This runs the agent as a web server that other apps can talk to.
- **Run the server**: `python src/api.py`
- **Talk to it**: You need to send a "POST" request to `http://127.0.0.1:8000/chat`.

#### Example API Request (Python):
I've created `src/example_client.py` to show you exactly how to talk to the API. 
```powershell
python src/example_client.py
```

#### Example API Request (cURL):
```bash
curl -X POST "http://127.0.0.1:8000/chat" `
     -H "Content-Type: application/json" `
     -d '{"message": "Is google.com UP?", "thread_id": "session_123"}'
```

---

## 🧪 How to Test

### Testing the REST API
You can use `curl` or any API client (Postman/Insomnia) to test the `/chat` endpoint.

**Request:**
```bash
curl -X POST "http://127.0.0.1:8000/chat" \
     -H "Content-Type: application/json" \
     -d '{"message": "how is google.com doing?", "thread_id": "user_1"}'
```

### Testing MariaDB Connection
Run the test script to verify your database connection:
```powershell
python src/test_mariadb.py
```

### 📚 NEW: MariaDB Historical Analysis
The agent now queries Uptime Kuma's **MariaDB database directly** for long-term historical analysis.

- **Why?** Uptime Kuma's API only returns the last ~100 checks. For deeper analysis (e.g., "December 2025 downtime"), we need the full database.
- **How it works**: The agent uses the `queryMariaDBHistory` tool to JOIN the `heartbeat` table with the `monitor` table, providing rich reports with URLs, names, and error details.
- **Example Query**: *"Display all downtime for December 2025 with URLs"*

---

## 🛡️ Available Tools
The agent has access to powerful monitoring tools:

### Live Monitoring (via MCP)
1.  `getMonitor` - Full configuration details.
2.  `listMonitors` - Overview of all monitors.
3.  `listMonitorTypes` - Valid monitor types.
4.  `getMonitorSummary` - **Status Overview** (UP/DOWN reports).
5.  `getHeartbeats` - Recent historical data for one service.
6.  `getSettings` - Uptime Kuma server settings.
7.  `listHeartbeats` - Recent historical data for all services.
8.  `pauseMonitor` - Stop monitoring a service.
9.  `resumeMonitor` - Restart monitoring a service.

### Historical Analysis (via MariaDB)
10. `queryMariaDBHistory` - **[NEW]** Query the MariaDB database for long-term history by date range (e.g., "2025-12"), monitor ID, and downtime status. Returns monitor names, URLs, and error details.
11. `checkDomainExpiry` - **[NEW]** Check if a domain name is about to expire. input: domain (e.g. 'google.com'). Returns expiration date and days remaining.

---

## ⚡ Easy Access Tools

We've included tools to make development faster:

-   **`start.bat`**: Double-click this script in Windows to launch the setup wizard, Docker, or local Python agent.
-   **VS Code**: Open this folder in VS Code and press `F5` to start debugging immediately.
-   **`setup_wizard.py`**: Automates configuration for new team members.

---

## 🐳 Docker Support

To run the SRE Agent in a container (recommended for production):

1.  **Build and Run**:
    ```bash
    docker-compose up -d --build
    ```
2.  **Verify**:
    The API will be available at `http://localhost:8000`.
3.  **Logs**:
    Logs are persisted in the `./logs` directory on your host machine.

---

## 🧠 SRE Persona
The assistant acts as a **Senior Site Reliability Engineer**. It doesn't just list data; it:
- Identifies and prioritizes **DOWN** services.
- Calculates **Uptime Percentages**.
- Analyzes trends across date ranges.
- Uses emojis like ✅ for UP and 🔴 for DOWN for quick visual scans.
- Presents data in clear Markdown tables.

---

## 🔧 Troubleshooting

### `ModuleNotFoundError: No module named 'mysql'`
Make sure you've installed the dependencies in your virtual environment:
```powershell
.\venv\Scripts\pip install -r requirements.txt
```

### MariaDB Connection Failed
1. Verify your `.env` credentials match your MariaDB setup.
2. Ensure MariaDB is running on the specified host/port.
3. Check that the user has permissions to access the `kuma` database.
4. Run `python test_mariadb.py` to diagnose connection issues.
