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
    Saves a maintenance record directly to the database using the user's specified SQL logic.
    Args:
        title (str): Title of the maintenance.
        description (str): Description.
        start_date (str): ISO format date definition.
        end_date (str): ISO format date definition.
        affected_monitors (list): List of monitor NAMES to link.
        status_pages (list): List of status page IDs or Names (Default ID 1 used if not matched).
    """
    from ..core.database import get_db_pool
    from dateutil import parser
    from datetime import datetime
    
    logger.info(f"DEBUG: save_maintenance_record called with: Title='{title}', Monitors={affected_monitors}, Dates={start_date}/{end_date}")

    # Sanitize Dates
    try:
        dt_start = parser.parse(start_date)
        dt_end = parser.parse(end_date)
        start_date_str = dt_start.strftime('%Y-%m-%d %H:%M:%S')
        end_date_str = dt_end.strftime('%Y-%m-%d %H:%M:%S')
    except Exception as e:
        logger.error(f"Date Parsing Failed: {e}. Fallback to raw strings.")
        start_date_str = start_date
        end_date_str = end_date
    
    conn = None
    try:
        pool = get_db_pool()
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        # 1. Insert Maintenance
        # "INSERT INTO maintenance (title, description, user_id, active, strategy, start_date, end_date, timezone) ..."
        sql_main = """
            INSERT INTO maintenance 
            (title, description, user_id, active, strategy, start_date, end_date, timezone) 
            VALUES (%s, %s, 1, 1, 'single', %s, %s, 'SAME_AS_SERVER')
        """
        cursor.execute(sql_main, (title, description, start_date_str, end_date_str))
        maintenance_id = cursor.lastrowid
        
        logger.info(f"Created Maintenance Record ID: {maintenance_id}")

        # 2. Link Monitors
        # "INSERT INTO monitor_maintenance (monitor_id, maintenance_id) VALUES ((SELECT id FROM monitor WHERE name='...' LIMIT 1), ID);"
        if affected_monitors:
            for monitor_name in affected_monitors:
                # We do a lookup first to match the user's sub-query logic safely
                sql_mon = "SELECT id FROM monitor WHERE name LIKE %s LIMIT 1"
                cursor.execute(sql_mon, (f"%{monitor_name}%",))
                mon_res = cursor.fetchone()
                
                if mon_res:
                    mon_id = mon_res['id']
                    sql_link_mon = "INSERT INTO monitor_maintenance (monitor_id, maintenance_id) VALUES (%s, %s)"
                    cursor.execute(sql_link_mon, (mon_id, maintenance_id))
                    logger.info(f"Linked Monitor {monitor_name} (ID {mon_id}) to Maintenance {maintenance_id}")
                else:
                    logger.warning(f"Monitor not found: {monitor_name}")

        # 3. Link Status Pages
        # User specified: Check what ID the status page has.
        if status_pages:
             for sp_name in status_pages:
                # Lookup Status Page ID by Title (or Slug if needed)
                sql_sp_lookup = "SELECT id FROM status_page WHERE title LIKE %s OR slug LIKE %s LIMIT 1"
                cursor.execute(sql_sp_lookup, (f"%{sp_name}%", f"%{sp_name}%"))
                sp_res = cursor.fetchone()
                
                if sp_res:
                    sp_id = sp_res['id']
                    sql_link_sp = "INSERT INTO maintenance_status_page (status_page_id, maintenance_id) VALUES (%s, %s)"
                    cursor.execute(sql_link_sp, (sp_id, maintenance_id))
                    logger.info(f"Linked Status Page '{sp_name}' (ID {sp_id}) to Maintenance {maintenance_id}")
                else:
                    # Fallback to ID 1 if not found (as per previous hardcode, or log warning)
                    logger.warning(f"Status Page '{sp_name}' not found. Defaulting to ID 1.")
                    try:
                        sql_link_sp_def = "INSERT INTO maintenance_status_page (status_page_id, maintenance_id) VALUES (1, %s)"
                        cursor.execute(sql_link_sp_def, (maintenance_id,))
                    except Exception as e:
                         pass # ID 1 might not exist or duplicate
        else:
             # Default to ID 1 if list is empty
             sql_sp = "INSERT INTO maintenance_status_page (status_page_id, maintenance_id) VALUES (1, %s)"
             cursor.execute(sql_sp, (maintenance_id,))
        
        conn.commit()
        cursor.close()
        
        return f"Successfully created maintenance '{title}' (ID: {maintenance_id}). Linked Monitors: {len(affected_monitors) if affected_monitors else 0}, Status Pages: {len(status_pages) if status_pages else 1}."

    except Exception as e:
        logger.error(f"Database Save Error: {e}")
        return f"Failed to save maintenance: {str(e)}"
    finally:
        if conn and conn.is_connected():
            conn.close()
