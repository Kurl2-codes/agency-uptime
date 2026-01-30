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
    Saves a maintenance record by calling the Uptime Kuma API.
    This ensures the server cache is updated and the event is broadcasted immediately.
    
    Args:
        title (str): Title of the maintenance.
        description (str): Description.
        start_date (str): ISO string (YYYY-MM-DD HH:mm:ss).
        end_date (str): ISO string.
        affected_monitors (list): List of monitor names.
        status_pages (list): List of status page names.
    """
    import requests
    import os
    
    kuma_url = os.getenv("UPTIME_KUMA_URL", "http://uptime-kuma:3001")
    url = f"{kuma_url}/api/maintenance/create"
    
    logger.info(f"Adding Maintenance via API: {title} to {url}")
    
    payload = {
        "title": title,
        "description": description,
        "start_date": start_date,
        "end_date": end_date,
        "affected_monitors": affected_monitors,
        "status_pages": status_pages if status_pages else []
    }
    
    try:
        # Use a reasonable timeout
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            res_json = response.json()
            if res_json.get("ok"):
                return f"Successfully created maintenance '{title}' (ID: {res_json.get('maintenance_id')}). Visible immediately."
            else:
                return f"API Error: {res_json.get('msg')}"
        else:
            return f"Failed to connect to API. Status: {response.status_code}. Body: {response.text}"
            
    except Exception as e:
        logger.error(f"Save Maintenance API Failed: {e}")
        return f"Error saving maintenance via API. Ensure Uptime Kuma is running at {kuma_url}. Details: {str(e)}"
