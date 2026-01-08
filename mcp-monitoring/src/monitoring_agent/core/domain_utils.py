import whois
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Union

logger = logging.getLogger("monitoring_agent.domain")

def check_domain_expiry(domain: str) -> Dict[str, Any]:
    """
    Check the expiration date of a domain name using WHOIS.
    Returns:
        Dict containing domain, expiration_date (ISO), days_until_expiry, and status.
    """
    try:
        w = whois.whois(domain)
        
        # Some registrars return a list of dates, take the first one or the only one
        exp_date = w.expiration_date
        if isinstance(exp_date, list):
            exp_date = exp_date[0]
            
        if not exp_date:
            return {"domain": domain, "error": "Could not find expiration date."}
            
        now = datetime.now()
        
        # Helper: Ensure timezone consistency
        if exp_date.tzinfo is not None and now.tzinfo is None:
             # If exp_date is timezone-aware, assume it's UTC or convert 'now' to be aware (using local time)
             # simpler: just make exp_date naive for rough day calculation, or make now aware.
             # Using astimezone() on now gets us local aware time, which is usually safe to subtract.
             now = now.astimezone()
        elif exp_date.tzinfo is None and now.tzinfo is not None:
             exp_date = exp_date.astimezone()

        # Fallback if mismatch persists (e.g. different timezones): normalize both to UTC or strip
        # Ideally, we just strip for the day count if we don't care about hours
        if exp_date.tzinfo is not None:
             now = datetime.now(exp_date.tzinfo)
        
        days_left = (exp_date - now).days
        
        status = "OK"
        if days_left < 30:
            status = "CRITICAL (Expiring soon)"
        elif days_left < 60:
            status = "WARNING"
            
        return {
            "domain": domain,
            "expiration_date": exp_date.isoformat(),
            "days_until_expiry": days_left,
            "registrar": w.registrar,
            "status": status
        }
    except Exception as e:
        logger.error(f"WHOIS Error for {domain}: {e}")
        return {"domain": domain, "error": str(e)}
