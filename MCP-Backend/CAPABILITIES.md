# System Capabilities

The **SRE Monitoring Agent** acts as an intelligent layer over your Uptime Kuma monitoring infrastructure.

## Core Capabilities

### 1. Live Monitoring
**Source**: Uptime Kuma MCP Server
- **Real-time Status**: Instantly check if a service is UP or DOWN.
- **Heartbeat Analysis**: View recent response time (latency) and status codes.
- **Configuration**: Inspect monitor settings (interval, retries, etc.).
- **Control**: Pause or Resume monitors directly from the chat.

### 2. Historical Analysis (Enterprise Feature)
**Source**: MariaDB Direct Connection
- **Long-term History**: Bypass the ~100 entry limit of the API.
- **Complex Filtering**: Query by:
    - Date Range (e.g., "December 2025")
    - Specific Monitor
    - Downtime Only (Filter out healthy checks)
- **Root Cause Correlation**: Correlate downtime timestamps with external events.

### 3. Intelligent Reasoning
**Source**: OpenAI GPT-4o-mini + LangGraph
- **SRE Persona**: The agent acts as a Senior SRE. It doesn't just dump data; it interprets it.
- **Prioritization**: Automatically highlights critical failures.
- **Troubleshooting**: Suggests possible causes for errors (e.g., "502 Bad Gateway" -> "Check upstream server").

## Integration Points

### CLI (Terminal)
- Interactive chat interface.
- Rich text formatting (Tables, Markdown).
- Best for ad-hoc analysis.

### REST API
- `POST /chat` endpoint.
- Returns JSON responses.
- Ready for integration with dashboards, Slack bots, or other UI frontends.
