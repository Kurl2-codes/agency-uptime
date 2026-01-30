import logging
from langchain_core.tools import StructuredTool
from mcp import ClientSession

from .database import query_mariadb_history, get_quick_stats_db
from .domain_utils import check_domain_expiry

logger = logging.getLogger("core.tools")

async def create_langchain_tools(session: ClientSession):
    """
    Create a list of LangChain tools from the MCP session and internal helpers.
    """
    tools_list = await session.list_tools()
    logger.info(f"Found {len(tools_list.tools)} tools from MCP server.")
    
    lc_tools = []
    
    # 1. Add MCP Tools
    for t in tools_list.tools:
        async def make_tool_func(tool_name=t.name):
            async def _func(**kwargs):
                return await session.call_tool(tool_name, arguments=kwargs)
            return _func

        tool_func = await make_tool_func()
        
        try:
            lc_tool = StructuredTool.from_function(
                func=None,
                coroutine=tool_func,
                name=t.name,
                description=t.description or "",
            )
            lc_tools.append(lc_tool)
        except Exception as e:
            logger.error(f"Error creating tool {t.name}: {e}")

    # 2. Add MariaDB History Tool
    mariadb_tool = StructuredTool.from_function(
        func=None,
        coroutine=query_mariadb_history,
        name="queryMariaDBHistory",
        description="Query the internal MariaDB database (kuma.heartbeat) for long-term history. Filter by monitor_id (optional), start_date (YYYY-MM), and downtime_only."
    )
    lc_tools.append(mariadb_tool)

    # 3. Add Domain Expiry Tool
    # Note: check_domain_expiry is synchronous, so we pass it as 'func'
    domain_tool = StructuredTool.from_function(
        func=check_domain_expiry,
        name="checkDomainExpiry",
        description="Check if a domain name is about to expire. input: domain (e.g. 'google.com'). Returns expiration date and days remaining."
    )
    lc_tools.append(domain_tool)

    # 4. Add Quick Stats Tool
    stats_tool = StructuredTool.from_function(
        func=None,
        coroutine=get_quick_stats_db,
        name="getQuickStats",
        description="Get quick stats (Monitor Count, Agency Performance, MTTR) directly from the database."
    )
    lc_tools.append(stats_tool)

    # 5. Add Global Latency Tool
    from tools.multi_region import check_global_latency
    latency_tool = StructuredTool.from_function(
        func=None,
        coroutine=check_global_latency,
        name="checkGlobalLatency",
        description="Check latency of a URL from global regions (PH, NZ, AU, US, EU, BR). input: url (string). Returns JSON with regional latencies."
    )
    lc_tools.append(latency_tool)

    # 6. Add Email Maintenance Scan Tool
    from tools.email_tools import scan_maintenance_emails
    email_tool = StructuredTool.from_function(
        func=scan_maintenance_emails,
        name="scanMaintenanceEmails",
        description="Checks the internal queue for emails received via Webhook. Call this to see if n8n has pushed any new maintenance notifications."
    )
    lc_tools.append(email_tool)

    # 7. Add Maintenance Record Tool
    from tools.maintenance_tools import fetch_maintenance_records
    maintenance_tool = StructuredTool.from_function(
        func=fetch_maintenance_records,
        name="getMaintenanceList",
        description="Get a list of scheduled maintenance windows from Uptime Kuma. input: limit (optional int)."
    )
    lc_tools.append(maintenance_tool)

    # 7.5. Add Maintenance SAVE Tool (SQL)
    from tools.maintenance_tools import save_maintenance_record
    save_tool = StructuredTool.from_function(
        func=save_maintenance_record,
        name="saveMaintenanceRecord",
        description="Saves a new maintenance schedule to the database. REQUIRED arguments: title, description, start_date, end_date, affected_monitors (list of names). Use this to 'Approved' requests."
    )
    lc_tools.append(save_tool)
    
    # 8. Add Outbound Notification Tool (Reply via n8n)
    from tools.email_tools import send_webhook_notification
    notification_tool = StructuredTool.from_function(
        func=None,
        coroutine=send_webhook_notification,
        name="sendEmailNotification",
        description="Send an email/reply via n8n. Use this to ask the sender for missing info (e.g., matching status page, affected components). input: to_email, subject, message."
    )
    lc_tools.append(notification_tool)
    
    return lc_tools
