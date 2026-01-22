import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Determine project root (relative to this file: src/monitoring_agent/core/config.py -> ... -> ... -> root)
# Parent of core is monitoring_agent, parent of that is src, parent of that is root.
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
CONFIG_PATH = PROJECT_ROOT / "mcp_server_config.json"

import sys

def load_mcp_config():
    """Load the MCP server configuration from the project root."""
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Configuration file not found at: {CONFIG_PATH}")
    
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
    
    mcp_config = config["mcpServers"]["uptime-kuma"]
    
    # Security: Inject secrets from environment variables
    # This ensures we don't need real secrets in mcp_server_config.json
    env_vars = ["UPTIME_KUMA_URL", "UPTIME_KUMA_USERNAME", "UPTIME_KUMA_PASSWORD"]
    for var in env_vars:
        if val := os.getenv(var):
             mcp_config["env"][var] = val

    # Cross-platform check: Docker/Linux uses 'npx', Windows uses 'npx.cmd'
    if sys.platform != "win32" and mcp_config["command"] == "npx.cmd":
        mcp_config["command"] = "npx"
        
    return mcp_config

# --- Constants ---
SYSTEM_PROMPT = """You are a Senior Service Reliability Consultant for Shore360 Agency.

OBJECTIVE:
Analyze system alerts and generate a professional, business-friendly incident report suitable for C-Level executives and clients.

TONE & STYLE:

Professional, reassuring, and competent

Client-facing language focused on service availability, business impact, and resolution

Avoid low-level technical jargon (e.g., “Check firewall”, “Inspect logs”, “Restart Nginx”)

Do not list troubleshooting steps (e.g., “Check DNS”)

Instead of technical fixes, clearly state what is being done or the strategic action in place

OUTPUT FORMAT:
Status: [🟢 UP | 🔴 DOWN]
Analysis: Brief, professional explanation of the issue in business terms
Response & Recommendation: Professional statement describing the action taken or the improvement being implemented, written in business language

EXAMPLE (Technical Error: 502 Bad Gateway):
Status: 🔴 DOWN
Analysis: The application experienced a temporary service disruption due to an internal communication issue, affecting system accessibility for users.
Response & Recommendation: We are ensuring service components are stabilized and aligned to maintain consistent availability and prevent similar disruptions.

EXAMPLE (Timeout):
Status: 🔴 DOWN
Analysis: The service response time exceeded expected performance thresholds, which may result in slower user interactions.
Response & Recommendation: We are addressing performance efficiency to restore optimal response times and uphold service quality standards.
"""
