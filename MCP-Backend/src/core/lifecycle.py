
import asyncio
import os
import logging
from contextlib import asynccontextmanager, AsyncExitStack
from fastapi import FastAPI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_openai import ChatOpenAI

from .config import load_mcp_config
from .tools import create_langchain_tools
from .graph import build_graph

logger = logging.getLogger("api_server")

class APIState:
    graph = None

api_context = APIState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the lifecycle of the FastAPI application.
    Initializes MCP connection, loads tools, and builds the agent graph.
    """
    stack = AsyncExitStack()
    try:
        logger.info("Lifespan: Initializing MCP Connection...")
        config = load_mcp_config()
        server_params = StdioServerParameters(
            command=config["command"],
            args=config["args"],
            env={**config["env"], **os.environ},
        )
        
        # Connect to MCP Server (Uptime Kuma)
        read, write = await stack.enter_async_context(stdio_client(server_params))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        
        # Connection Retry Logic
        max_retries = 12
        retry_delay = 5
        tools = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to MCP Server/Uptime Kuma (Attempt {attempt+1}/{max_retries})...")
                tools = await create_langchain_tools(session)
                tool_names = [t.name for t in tools]
                logger.info(f"Successfully connected to MCP Server. Loaded Tools: {tool_names}")
                break
            except Exception as e:
                logger.warning(f"Connection attempt {attempt+1} failed: {e}")
                if attempt == max_retries - 1:
                    logger.error("Max retries reached. Could not connect to Uptime Kuma.")
                    raise e
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)

        # Initialize Agent Model
        model = ChatOpenAI(
            model="gpt-5-nano",
            temperature=0,
            max_retries=3,
        )
        api_context.graph = build_graph(model, tools)
        
        logger.info("Lifespan: Initialization COMPLETE")
        yield
        
    except Exception as e:
        logger.error(f"LIFESPAN CRITICAL ERROR: {e}", exc_info=True)
        raise e
    finally:
        logger.info("Lifespan: Cleaning up MCP connection...")
        try:
            await asyncio.wait_for(stack.aclose(), timeout=5.0)
            logger.info("Lifespan: Cleanup Finished")
        except asyncio.TimeoutError:
            logger.warning("Lifespan: Cleanup timed out after 5s.")
        except Exception as cleanup_err:
            logger.error(f"Lifespan: Error during cleanup: {cleanup_err}")
