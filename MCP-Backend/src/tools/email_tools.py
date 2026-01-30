import logging
import sys
import os

# Ensure we can import from src
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

logger = logging.getLogger("tools.email")

def scan_maintenance_emails(hours: int = 24):
    """
    Scans the local ingestion queue (populated by n8n webhook) for maintenance emails.
    """
    # NEW: Fetch from Ingestor
    from core.ingestor import EmailIngestor
    ingestor = EmailIngestor()
    emails = ingestor.get_pending_emails()
    
    if not emails:
        return "No new emails received from the webhook."

    try:
        # 2. Smart Filter (Token Optimization)
        # Even though n8n might filter, we keep this as a safety net
        keywords = ["maintenance", "upgrade", "scheduled", "downtime", "interruption", "patch", "update"]
        filtered_emails = []
        
        for email in emails:
            txt = (email['subject'] + " " + email['body']).lower()
            # If n8n sends it, we assume it's somewhat relevant, but checking keywords doesn't hurt.
            # If you trust n8n 100%, you can comment this out.
            if any(k in txt for k in keywords):
                filtered_emails.append(email)
            else:
                # If n8n sent it but it has no keywords, it might be a weird forward.
                # Let's include it anyway if the queue is small, or log it.
                # For now, simplistic filter:
                filtered_emails.append(email) 
                
        # 3. Limit Quantity (Token Panic Prevention)
        # Only take the top 5 most recent RELEVANT emails
        filtered_emails = filtered_emails[:5]
        
        relevant_emails = filtered_emails
        
        if relevant_emails:
            logger.info(f"DEBUG: Processing {len(relevant_emails)} RELEVANT emails (Filtered from {len(emails)}).")
        else:
            logger.info(f"DEBUG: No relevant emails found (Scanned {len(emails)}).")

        if not relevant_emails:
            return "No maintenance-related emails found in the batch."
            
        output = "Here are the relevant maintenance emails received via webhook. Analyze them:\n\n"
        for i, email in enumerate(relevant_emails):
            output += f"--- Email {i+1} ---\n"
            output += f"Subject: {email['subject']}\n"
            output += f"From: {email['sender']}\n"
            output += f"Date: {email['date']}\n"
            # Truncate Body if huge (further token safety)
            body_preview = email['body'][:2000] 
            output += f"Body:\n{body_preview}\n\n"
            
        return output

    except Exception as e:
        logger.error(f"Failed to scan emails: {e}")
        return f"Error scanning emails: {str(e)}"


async def send_webhook_notification(to_email: str, subject: str, message: str, webhook_url: str = None):
    """
    Sends an outgoing email notification by triggering an external n8n webhook.
    
    Args:
        to_email (str): The recipient's email address.
        subject (str): The subject of the email.
        message (str): The body content of the email.
        webhook_url (str): The n8n webhook URL. If not provided, looks for N8N_REPLY_WEBHOOK_URL env var.
    """
    import httpx
    
    url = webhook_url or os.getenv("N8N_REPLY_WEBHOOK_URL")
    if not url:
        return "Error: No webhook URL provided. Please set N8N_REPLY_WEBHOOK_URL in .env or pass it as an argument."
        
    payload = {
        "action": "send_email",
        "to": to_email,
        "subject": subject,
        "body": message
    }
    
    logger.info(f"Sending webhook notification to {to_email} via {url}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)
            
        if response.status_code >= 200 and response.status_code < 300:
            return f"Successfully trigger notification webhook. Response: {response.text}"
        else:
            return f"Failed to trigger webhook. Status: {response.status_code} Body: {response.text}"
            
    except Exception as e:
        logger.error(f"Failed to send webhook notification: {e}")
        return f"Error triggering webhook: {str(e)}"
