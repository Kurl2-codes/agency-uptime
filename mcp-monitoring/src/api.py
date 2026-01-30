import sys
import os
import logging
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from langchain_core.messages import HumanMessage, SystemMessage

# Import from the new package
# Robust Path Setup: Ensure 'src' (current dir) is in sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)


from monitoring_agent.core.ingestor import EmailIngestor
from monitoring_agent.core.config import SYSTEM_PROMPT
from monitoring_agent.core.prompts import MAINTENANCE_EXECUTOR_PROMPT, MAINTENANCE_VALIDATOR_PROMPT
from monitoring_agent.core.utils import setup_logging, process_incoming_request
from monitoring_agent.core.lifecycle import lifespan, api_context

logger = setup_logging("api_server")

# CRITICAL: Windows Selector Event Loop Policy
if sys.platform == 'win32':
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI(lifespan=lifespan)

# --- Models ---
class ChatRequest(BaseModel):
    model_config = ConfigDict(extra='allow')
    message: str | dict | None = None
    text: str | None = None
    subject: str | None = None
    thread_id: str = "default"
    system_prompt: str | None = None

import uuid

class ChatResponse(BaseModel):
    response: str
    thread_id: str
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
        content={"detail": exc.errors(), "message": "Validation Failed. Check logs."}
    )

class WebhookEmailPayload(BaseModel):
    subject: str
    body: str | None = None
    text: str | None = None
    sender: str | None = None
    date: str | None = None

@app.post("/webhook/maintenance-emails")
async def webhook_ingest_email(payload: WebhookEmailPayload):
    """
    Endpoint for n8n to push maintenance emails to.
    """
    ingestor = EmailIngestor()
    data = payload.model_dump()
    
    # Handle n8n sending 'text' instead of 'body'
    if not data.get("body") and data.get("text"):
        data["body"] = data.get("text")
        
    success = ingestor.add_email(data)
    if success:
        return {"status": "received", "queue_size": ingestor.peek_count()}
    else:
        raise HTTPException(status_code=400, detail="Invalid payload")

@app.post("/chats", response_model=ChatResponse)
async def chat_endpoint_alias(request: Request):
    """Alias for /chat due to typo in n8n"""
    return await chat_endpoint(request)

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request):
    """
    Handles chat requests from Uptime Kuma or n8n.
    Robustly parses JSON body to extract 'message' and 'system_prompt'.
    """
    internal_req = await process_incoming_request(request)

    if not internal_req.message:
         raise HTTPException(status_code=422, detail="Could not extract any message content from request.")

    if not api_context.graph:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    # Generate new thread_id if none provided
    thread_id = internal_req.thread_id or str(uuid.uuid4())
    
    user_agent = request.headers.get('user-agent', 'unknown')
    logger.info(f"API Request From [{user_agent}] - Thread: {thread_id} - Prompt: {internal_req.system_prompt[:30] if internal_req.system_prompt else 'None'}...")
    
    config = {"configurable": {"thread_id": thread_id}}
    
    try:
        # Check if conversation already exists
        state = await api_context.graph.aget_state(config)
        input_messages = []

        # --- PERSONA SWITCHING LOGIC ---
        # PRIORITY 1: Explicit Save Mode / Executor Mode (The SAVER)
        if internal_req.system_prompt == "MAINTENANCE_SAVE":
             logger.info("Persona: MAINTENANCE EXECUTOR (Saver)")
             input_messages.append(SystemMessage(content=MAINTENANCE_EXECUTOR_PROMPT))

        # PRIORITY 1.5: The NLP Translator/Validator (User calls this Maintenance_EXECUTOR)
        elif internal_req.system_prompt == "Maintenance_EXECUTOR":
             logger.info("Persona: MAINTENANCE VALIDATOR (Translator)")
             input_messages.append(SystemMessage(content=MAINTENANCE_VALIDATOR_PROMPT))

        # PRIORITY 2: Explicit Maintenance Mode
        elif internal_req.system_prompt == "MAINTENANCE_MODE":
            logger.info("Persona: MAINTENANCE VALIDATOR (Explicit)")
            input_messages.append(SystemMessage(content=MAINTENANCE_VALIDATOR_PROMPT))

        # PRIORITY 3: Explicit Custom System Prompt (e.g. SRE Agent)
        elif internal_req.system_prompt:
             # Most common path for SRE Reports
             input_messages.append(SystemMessage(content=internal_req.system_prompt))

        # PRIORITY 4: Heuristic Detection (Fallback)
        else:
            msg_lower = internal_req.message.lower()
            pk = ["maintenance window", "schedule maintenance", "planned upgrade", "maintenance notification"]
            is_maintenance_context = any(k in msg_lower for k in pk)
            is_scan_cmd = "scan" in msg_lower and ("email" in msg_lower or "monitor" in msg_lower)

            if is_maintenance_context or is_scan_cmd:
                logger.info("Persona: MAINTENANCE VALIDATOR (Heuristic)")
                input_messages.append(SystemMessage(content=MAINTENANCE_VALIDATOR_PROMPT))
            else:
                input_messages.append(SystemMessage(content=SYSTEM_PROMPT))
        
        input_messages.append(HumanMessage(content=internal_req.message))
        
        result = await api_context.graph.ainvoke({"messages": input_messages}, config=config)
        final_msg = result["messages"][-1]
        
        return ChatResponse(
            response=final_msg.content,
            thread_id=thread_id,
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
