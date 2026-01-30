import logging
from collections import deque
from datetime import datetime
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

class EmailIngestor:
    """
    Singleton class to store emails received via webhook.
    The Agent tools will 'pop' emails from here to process them.
    """
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmailIngestor, cls).__new__(cls)
            cls._instance.emails = deque() # Store as a FIFO queue? Or just a list? 
                                        # If the agent scans "recent", maybe just a list is fine, 
                                        # but existing logic was "fetch recent".
                                        # Let's keep them until processed.
            logger.info("EmailIngestor initialized.")
        return cls._instance

    def add_email(self, data: Dict):
        """
        Add an email to the queue.
        Expected keys: 'subject', 'sender', 'body', 'date'
        """
        # Validate minimal fields
        required = ['subject', 'body']
        for r in required:
            if r not in data:
                logger.warning(f"Ignored invalid webhook data: missing {r}")
                return False
        
        # Normalize
        email_obj = {
            "subject": data.get("subject", "No Subject"),
            "sender": data.get("sender", "Unknown"),
            "body": data.get("body", ""),
            "date": data.get("date", datetime.now().isoformat()),
            "received_at": datetime.now().isoformat()
        }
        
        self.emails.append(email_obj)
        logger.info(f"Ingested email: {email_obj['subject']}")
        return True

    def get_pending_emails(self) -> List[Dict]:
        """
        Returns all pending emails and clears the queue.
        This simulates 'fetching new emails'.
        """
        results = list(self.emails)
        self.emails.clear()
        return results

    def peek_count(self) -> int:
        return len(self.emails)
