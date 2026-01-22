import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Log directory relative to project root
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
LOG_DIR = PROJECT_ROOT / "logs"

def setup_logging(name: str = "monitoring_agent") -> logging.Logger:
    """Configure centralized logging."""
    if not LOG_DIR.exists():
        LOG_DIR.mkdir(exist_ok=True)
    
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    # console handler
    c_handler = logging.StreamHandler(sys.stdout)
    c_handler.setLevel(logging.INFO)
    c_format = logging.Formatter('%(name)s - %(levelname)s - %(message)s')
    c_handler.setFormatter(c_format)
    
    # file handler (rotating)
    f_handler = RotatingFileHandler(
        LOG_DIR / "agent.log", maxBytes=5*1024*1024, backupCount=3
    )
    f_handler.setLevel(logging.INFO)
    f_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    f_handler.setFormatter(f_format)
    
    # Avoid adding duplicate handlers if setup_logging is called multiple times
    if not logger.handlers:
        logger.addHandler(c_handler)
        logger.addHandler(f_handler)
        
    return logger
    return logger

async def process_incoming_request(request):
    """
    Parses a FastAPI Request object to extract message, thread_id, and system_prompt.
    Supports standard JSON, flattened JSON, and n8n formats.
    Returns a NamedTuple or SimpleNamespace with attributes: message, thread_id, system_prompt.
    """
    from types import SimpleNamespace
    import json
    
    try:
        raw_body = await request.json()
    except Exception as e:
        # If body is empty or invalid, return empty defaults (handled by caller logic)
        return SimpleNamespace(message="", thread_id="default", system_prompt=None)

    # Extract fields manually
    message = raw_body.get('message')
    text = raw_body.get('text')
    subject = raw_body.get('subject')
    thread_id = raw_body.get('thread_id', 'default')
    system_prompt = raw_body.get('system_prompt')

    # Logic: Flatten logic - if 'message' is missing, try to treat the whole body (minus meta fields) as the message
    if not message:
        if text or subject:
            parts = []
            if subject: parts.append(f"Subject: {subject}")
            if text: parts.append(text)
            message = "\n\n".join(parts)
        else:
            # Fallback: Use the whole body as the message content (Generic JSON handler)
            # Remove metadata fields to keep it clean
            cleanup_keys = ['thread_id', 'system_prompt', 'model_extra']
            clean_body = {k: v for k, v in raw_body.items() if k not in cleanup_keys and v is not None}
            
            if clean_body:
                 message = json.dumps(clean_body)
            else:
                 message = ""

    # Ensure message is string
    if isinstance(message, dict):
        message = json.dumps(message)
    
    return SimpleNamespace(message=message, thread_id=thread_id, system_prompt=system_prompt)
