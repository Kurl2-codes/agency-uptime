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
