import asyncio
import sys
import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Import from the new package
# Only works if running from root or if src is in pythonpath
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.monitoring_agent.core.config import load_mcp_config, SYSTEM_PROMPT
from src.monitoring_agent.core.tools import create_langchain_tools
from src.monitoring_agent.core.graph import build_graph
from src.monitoring_agent.core.utils import setup_logging

logger = setup_logging("api_server")

# CRITICAL: Windows Selector Event Loop Policy
if sys.platform == 'win32':
     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

class APIState:
    graph = None

api_context = APIState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from contextlib import AsyncExitStack
    stack = AsyncExitStack()
    try:
        logger.info("Lifespan: Initializing MCP Connection...")
        config = load_mcp_config()
        server_params = StdioServerParameters(
            command=config["command"],
            args=config["args"],
            env={**config["env"], **os.environ},
        )
        
        read, write = await stack.enter_async_context(stdio_client(server_params))
        session = await stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        
        # Retry logic for MCP connection
        # Uptime Kuma might take a while to start and accept socket connections
        max_retries = 12
        retry_delay = 5
        tools = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to MCP Server/Uptime Kuma (Attempt {attempt+1}/{max_retries})...")
                # creating langchain tools triggers session.list_tools() which validates the connection
                tools = await create_langchain_tools(session)
                logger.info("Successfully connected to MCP Server and Uptime Kuma.")
                break
            except Exception as e:
                logger.warning(f"Connection attempt {attempt+1} failed: {e}")
                if attempt == max_retries - 1:
                    logger.error("Max retries reached. Could not connect to Uptime Kuma.")
                    raise e
                logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)

        # Optimization:
        # 1. Use gpt-4o-mini for speed and cost.
        # 2. Set temperature=0 for deterministic responses (avoids regeneration).
        # 3. Increase max_retries for robustness.
        model = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            max_retries=3,
            # connection pool settings are handled by the underlying httpx client, usually default is good.
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

app = FastAPI(lifespan=lifespan)

# --- Models ---
class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"

class ChatResponse(BaseModel):
    response: str
    history: List[Dict]

# --- Endpoints ---
@app.get("/")
async def root():
    return {"status": "ok", "message": "SRE Monitoring API is running"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, raw_request: Request):
    if not api_context.graph:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    # Log the incoming request with User-Agent to identify the source (e.g. Node.js)
    user_agent = raw_request.headers.get('user-agent', 'unknown')
    logger.info(f"API Request From [{user_agent}] - Thread: {request.thread_id} - Message: {request.message[:50]}...")
    
    config = {"configurable": {"thread_id": request.thread_id}}
    
    try:
        # Check if conversation already exists
        state = await api_context.graph.aget_state(config)
        
        input_messages = []
        if not state.values:
            input_messages.append(SystemMessage(content=SYSTEM_PROMPT))
        
        input_messages.append(HumanMessage(content=request.message))
        
        result = await api_context.graph.ainvoke({"messages": input_messages}, config=config)
        
        final_msg = result["messages"][-1]
        
        # Convert history to serializable dicts
        history = []
        for m in result["messages"]:
            history.append({
                "role": "assistant" if m.type == "ai" else m.type,
                "content": m.content
            })
            
        return ChatResponse(response=final_msg.content, history=history)
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
