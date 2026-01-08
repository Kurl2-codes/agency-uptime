import logging
from langchain_core.tools import StructuredTool
from mcp import ClientSession

from .database import query_mariadb_history
from .domain_utils import check_domain_expiry

logger = logging.getLogger("monitoring_agent.tools")

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

    return lc_tools
