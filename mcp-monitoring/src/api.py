import asyncio
import sys
import os
import logging
from contextlib import asynccontextmanager
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Import from the new package
# Robust Path Setup: Ensure 'src' (current dir) is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# Now we can import 'monitoring_agent' directly, which is a package in 'src'
from monitoring_agent.core.ingestor import EmailIngestor
from monitoring_agent.core.config import load_mcp_config, SYSTEM_PROMPT
from monitoring_agent.core.prompts import MAINTENANCE_EXECUTOR_PROMPT, MAINTENANCE_VALIDATOR_PROMPT
from monitoring_agent.core.tools import create_langchain_tools
from monitoring_agent.core.graph import build_graph
from monitoring_agent.core.utils import setup_logging, process_incoming_request

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

app = FastAPI(lifespan=lifespan)

# --- Models ---
# --- Models ---
class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='allow')  # Allow arbitrary fields (e.g. title, description from n8n)

    message: str | dict | None = None  # Allow dict to handle n8n auto-parsed JSON objects
    text: str | None = None       # Alias often used by n8n/Zapier
    subject: str | None = None    # Email subject
    thread_id: str = "default"
    system_prompt: str | None = None

class ChatResponse(BaseModel):
    response: str
    history: List[Dict]

# --- Endpoints ---
@app.get("/")
async def root():
    return {"status": "ok", "message": "SRE Monitoring API is running"}

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"API VALIDATION ERROR: {exc}")
    try:
        body = await request.body()
        logger.error(f"INVALID BODY RECEIVED: {body.decode('utf-8')}")
    except:
        pass
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "message": "Validation Failed. Check logs for raw body."}
    )

class WebhookEmailPayload(BaseModel):
    subject: str
    body: str
    sender: str | None = None
    date: str | None = None

@app.post("/webhook/maintenance-emails")
async def webhook_ingest_email(payload: WebhookEmailPayload):
    """
    Endpoint for n8n to push maintenance emails to.
    """
    ingestor = EmailIngestor()
    success = ingestor.add_email(payload.model_dump())
    if success:
        return {"status": "received", "queue_size": ingestor.peek_count()}
    else:
        raise HTTPException(status_code=400, detail="Invalid payload")

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request):
    """
    Manual JSON handling to robustly support ANY input format from n8n/Zapier.
    Bypasses strict Pydantic validation to avoid 422 errors.
    """
    # Use robust parser utility
    internal_req = await process_incoming_request(request)

    if not internal_req.message:
         raise HTTPException(status_code=422, detail="Could not extract any message content from request.")

    # START AGENT LOGIC (Copy-Paste of previous logic, adapted for internal_req)
    if not api_context.graph:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    # Log the incoming request with User-Agent to identify the source (e.g. Node.js)
    user_agent = request.headers.get('user-agent', 'unknown')
    logger.info(f"API - FULL MESSAGE BODY: {internal_req.message}")
    logger.info(f"API Request From [{user_agent}] - Thread: {internal_req.thread_id} - Message Preview: {internal_req.message[:50]}...")
    
    config = {"configurable": {"thread_id": internal_req.thread_id}}
    
    try:
        # Check if conversation already exists
        state = await api_context.graph.aget_state(config)
        
        input_messages = []
        input_messages = []
        
        # DEBUG: Log the received system prompt
        logger.info(f"API - Received System Prompt Length: {len(internal_req.system_prompt) if internal_req.system_prompt else 0}")
        if internal_req.system_prompt:
             logger.info(f"API - System Prompt Preview: {internal_req.system_prompt[:50]}...")

        # MAINTENANCE MODE: Dynamic System Prompt Injection
        # We auto-detect "Maintenance Mode" if the user mentions maintenance scheduling words,
        # OR if they explicitly request it via system_prompt.
        msg_lower = internal_req.message.lower()
        
        # Keywords that strongly suggest a maintenance request
        pk = ["maintenance", "schedule", "upgrade", "downtime", "alert", "planned"]
        is_maintenance_context = any(k in msg_lower for k in pk)
        
        # Also check strict "scan" command just in case
        is_scan_cmd = "scan" in msg_lower and ("email" in msg_lower or "monitor" in msg_lower)

        # PRIORITY CHECK: Explicit Save Mode must come first!
        if internal_req.system_prompt == "MAINTENANCE_SAVE":
             logger.info("API - HOST OVERRIDE: Activating Maintenance EXECUTOR Persona.")
             input_messages.append(SystemMessage(content=MAINTENANCE_EXECUTOR_PROMPT))

        elif is_maintenance_context or is_scan_cmd or internal_req.system_prompt == "MAINTENANCE_MODE":
            logger.info("API - HOST OVERRIDE: Activating Maintenance Validator Persona.")
            input_messages.append(SystemMessage(content=MAINTENANCE_VALIDATOR_PROMPT))

        elif internal_req.system_prompt:
             # Allow manual override from client
             input_messages.append(SystemMessage(content=internal_req.system_prompt))
             
        elif not state.values:
            # Default to Incident Consultant (from config.py) for reports
            input_messages.append(SystemMessage(content=SYSTEM_PROMPT))
        
        input_messages.append(HumanMessage(content=internal_req.message))
        
        result = await api_context.graph.ainvoke({"messages": input_messages}, config=config)
        
        final_msg = result["messages"][-1]
        
        # DEBUG: Log the final response so we can debug JSON issues
        logger.info(f"API - Final Response: {final_msg.content}")

        # Attempt to parse response as JSON if it looks like one (for n8n compatibility)
        # This allows returning structured data to n8n
        import json
        try:
             # If the agent returned a JSON string block, extract it?
             # Simple check: if starts with { and ends with }, parse it
             content = final_msg.content.strip()
             if content.startswith('{') and content.endswith('}'):
                 # It's already valid JSON, so we just return it as response text?
                 # n8n might want it as an object?
                 # But our response model is ChatResponse(response=str).
                 # So we return the string.
                 pass
        except:
            pass

        return ChatResponse(
            response=final_msg.content, 
            history=[{"role": m.type, "content": m.content} for m in result["messages"]]
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
