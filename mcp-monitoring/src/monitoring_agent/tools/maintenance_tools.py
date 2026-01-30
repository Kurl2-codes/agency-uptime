import logging
import requests
import os
import json

logger = logging.getLogger("monitoring_agent.tools.maintenance")

def fetch_maintenance_records(limit: int = 10):
    """
    Fetches the list of scheduled maintenance windows from the system.
    Returns details including Title, Start Date, End Date, and Description.
    
    Args:
        limit (int): Max number of records to return. Default 10.
    """
    kuma_url = os.getenv("UPTIME_KUMA_URL", "http://uptime-kuma:3001")
    url = f"{kuma_url}/api/maintenance"
    
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("ok"):
            return f"Error fetching records: {data.get('msg')}"
        
        records = data.get("data", [])
        if not records:
            return "No maintenance records found."
            
        # Format for Agent
        output = f"Found {len(records)} Maintenance Records (Showing recent {limit}):\n\n"
        for i, rec in enumerate(records[:limit]):
            active_status = "ACTIVE" if rec.get('active') else "INACTIVE"
            output += f"{i+1}. {rec.get('title')} ({active_status})\n"
            output += f"   Start: {rec.get('start_date')}\n"
            output += f"   End:   {rec.get('end_date')}\n"
            output += f"   Desc:  {rec.get('description')}\n\n"
            
        return output
        
    except Exception as e:
        logger.error(f"Failed to fetch maintenance records: {e}")
        return f"Error connecting to maintenance API: {str(e)}"

def save_maintenance_record(title: str, description: str, start_date: str, end_date: str, affected_monitors: list[str], status_pages: list[str] = None):
    """
    Saves a maintenance record by calling Uptime Kuma's internal API.
    This ensures the In-Memory Scheduler is updated immediately (Realtime).
    """
    kuma_url = os.getenv("UPTIME_KUMA_URL", "http://uptime-kuma:3001")
    url = f"{kuma_url}/api/maintenance"
    
    logger.info(f"DEBUG: save_maintenance_record (API) called with: Title='{title}', Monitors={affected_monitors}")

    # 1. Resolve Monitor IDs & Status Page IDs locally via DB (Still need DB for ID lookup efficiently)
    # OR we can let the API handle it? 
    # The API implementation I wrote expects IDs in 'monitors' and 'status_pages' arrays.
    # So we should resolve names to IDs here first.
    
    from ..core.database import get_db_pool
    from dateutil import parser
    
    # Sanitize Dates
    try:
        dt_start = parser.parse(start_date).strftime('%Y-%m-%d %H:%M:%S')
        dt_end = parser.parse(end_date).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        dt_start = start_date
        dt_end = end_date

    monitor_ids = []
    status_page_ids = []

    conn = None
    try:
        pool = get_db_pool()
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Resolve Monitors
        if affected_monitors:
            for m_name in affected_monitors:
                cursor.execute("SELECT id FROM monitor WHERE name LIKE %s LIMIT 1", (f"%{m_name}%",))
                if row := cursor.fetchone():
                    monitor_ids.append(row['id'])
        
        # Resolve Status Pages
        if status_pages:
            for sp_name in status_pages:
                cursor.execute("SELECT id FROM status_page WHERE title LIKE %s LIMIT 1", (f"%{sp_name}%",))
                if row := cursor.fetchone():
                    status_page_ids.append(row['id'])
        else:
            status_page_ids.append(1) # Default
            
        cursor.close()
    except Exception as e:
        logger.error(f"ID Lookup Failed: {e}")
        if conn: conn.close()
        return f"Error resolving IDs: {e}"
    finally:
        if conn and conn.is_connected():
            conn.close()

    # 2. Call the API
    payload = {
        "title": title,
        "description": description,
        "strategy": "single",
        "active": True,
        "start_date": dt_start,
        "end_date": dt_end,
        "monitors": monitor_ids,
        "status_pages": status_page_ids
    }
    
    try:
        res = requests.post(url, json=payload, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        if data.get("ok"):
            return f"Successfully created maintenance '{title}' via API (Realtime)."
        else:
            return f"API Information: {data.get('msg')}"
    except Exception as e:
        logger.error(f"API Post Failed: {e}")
        return f"Failed to call Uptime Kuma API: {e}"
