# Agency Uptime & MCP Agent

This repository contains the setup for **Agency Uptime** (a custom build of Uptime Kuma) and an **MCP (Model Context Protocol) Agent** for monitoring.

## 📂 Project Structure & Credentials

- `docker-compose.yml`: **Primary Config**. Set Database credentials here (env vars).
- `mcp-monitoring/`
  - `.env`: **Secrets**. Store `OPENAI_API_KEY` and Uptime Kuma API user/pass here.
  - `mcp_server_config.json`: Internal MCP connection settings.
- `uptime-kuma/`
  - `Dockerfile`: Custom build definition.

## 🚀 Quick Start

### 1. Prerequisites
- **Docker Desktop** installed.
- **MariaDB** running on your host machine (Port 3306), accessible via `host.docker.internal`.
- **Environment Variables**: Ensure `mcp-monitoring/.env` exists with your API keys.

### 2. Run with Docker
Start both services in the background:
```powershell
docker-compose up -d
```

### 3. Access Services
- **Uptime Kuma**: [http://localhost:3001](http://localhost:3001)
- **MCP Agent**: [http://localhost:8000](http://localhost:8000)

## 🛠 Configuration & Troubleshooting

### Rebuilding Services
If you modify source code (e.g., `uptime-kuma/server/`) or configuration files (like `.env` or `mcp_server_config.json`), you **must rebuild** the images:

```powershell
# Rebuild everything
docker-compose up -d --build

# Rebuild only one service
docker-compose up -d --build uptime-kuma
docker-compose up -d --build mcp-monitoring
```

### 🔐 Setting Up Credentials

#### 1. Database (MariaDB)
To change the database user/password, edit `docker-compose.yml` under the `uptime-kuma` service:
```yaml
environment:
  - UPTIME_KUMA_DB_USERNAME=root  # Change this
  - UPTIME_KUMA_DB_PASSWORD=root  # Change this
```
*Note: These credentials must match your host MariaDB user.*

#### 2. MCP Agent & OpenAI
Edit `mcp-monitoring/.env` to set your AI and API credentials:
```bash
OPENAI_API_KEY=sk-...
UPTIME_KUMA_USERNAME=silva
UPTIME_KUMA_PASSWORD=...
```
*After changing .env, you must rebuild: `docker-compose up -d --build mcp-monitoring`*

### Persistent Data
Data is stored in Docker named volumes to avoid Windows permission issues:
- `agency-uptime-data`: Uptime Kuma data.
- `mcp-logs`: MCP Agent logs.
