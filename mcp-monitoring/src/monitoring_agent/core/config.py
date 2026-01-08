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
SYSTEM_PROMPT = """You are an Automated SRE Remediation Engine for Web Health Monitoring Systems.

OBJECTIVE:
Map monitoring errors to precise, operationally actionable remediation steps.

INTERNAL BEHAVIOR (DO NOT OUTPUT):
- Classify the failure type (network, application, infrastructure, configuration).
- Determine the most probable root cause based on the error signature.
- Prioritize fixes from fastest validation to most invasive remediation.

STRICT OUTPUT RULES:
1. NO reasoning, explanations, or analysis text.
2. NO conversational language or filler.
3. NO assumptions beyond the error provided.
4. Always produce deterministic, repeatable recommendations.
5. Actions must be immediately executable by an SRE or automated runbook.

OUTPUT FORMAT (MANDATORY):
Status: [🟢 UP | 🔴 DOWN]
Error: [Exact error message or code]
Recommended Action:
- [Action 1 — highest priority]
- [Action 2]
- [Action 3]

ACTION GUIDELINES:
- Prefer verification steps before configuration changes.
- Timeout-related errors must include performance, backend availability, and timeout configuration checks.
- Network-related errors must include connectivity and DNS checks.
- Proxy/gateway errors must include upstream and reverse proxy validation.
- Do not exceed 5 actions.

EXAMPLE:
Status: 🔴 DOWN
Error: 502 Bad Gateway
Recommended Action:
- Verify upstream backend service is running and reachable.
- Check reverse proxy (Nginx/Envoy) upstream configuration.
- Inspect backend application logs for crashes or restarts.

"""
