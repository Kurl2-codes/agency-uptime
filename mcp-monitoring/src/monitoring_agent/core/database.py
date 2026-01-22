import os
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
import mysql.connector
from mysql.connector import pooling

logger = logging.getLogger("monitoring_agent.database")

# Global Connection Pool
_db_pool = None

def get_db_pool():
    global _db_pool
    if _db_pool is None:
        # Check HOST, then HOSTNAME (common variant), else localhost
        db_host = os.getenv("DB_HOST", os.getenv("UPTIME_KUMA_DB_HOST", os.getenv("UPTIME_KUMA_DB_HOSTNAME", "localhost")))
        db_user = os.getenv("DB_USER", os.getenv("UPTIME_KUMA_DB_USER", "kuma"))
        db_pass = os.getenv("DB_PASSWORD", os.getenv("UPTIME_KUMA_DB_PASSWORD"))
        db_name = os.getenv("DB_NAME", os.getenv("UPTIME_KUMA_DB_NAME", "kuma"))
        db_port = int(os.getenv("DB_PORT", os.getenv("UPTIME_KUMA_DB_PORT", 3306)))
        
        if not db_pass:
             raise ValueError("DB_PASSWORD is not set")

        _db_pool = mysql.connector.pooling.MySQLConnectionPool(
            pool_name="mcp_pool",
            pool_size=5,
            pool_reset_session=True,
            host=db_host,
            user=db_user,
            password=db_pass,
            database=db_name,
            port=db_port
        )
    return _db_pool

async def query_mariadb_history(monitor_id: Optional[int] = None, start_date: str = "2025-12", downtime_only: bool = True) -> List[Dict[str, Any]]:
    """
    Query Uptime Kuma's MariaDB database for historical heartbeats.
    - monitor_id: Filter by specific monitor.
    - start_date: Format YYYY-MM (e.g., 2025-12).
    - downtime_only: If true, only returns records where status is not UP (status != 1).
    """
    
    def _fetch():
        conn = None
        try:
            pool = get_db_pool()
            conn = pool.get_connection()
            cursor = conn.cursor(dictionary=True)
            
            query = """
                SELECT h.*, m.name, m.url 
                FROM heartbeat h 
                JOIN monitor m ON h.monitor_id = m.id 
                WHERE 1=1
            """
            params = []

            if monitor_id:
                query += " AND h.monitor_id = %s"
                params.append(monitor_id)
            
            if start_date:
                query += " AND h.end_time LIKE %s"
                params.append(f"{start_date}%")
            
            if downtime_only:
                query += " AND h.status != 1"
            
            query += " ORDER BY h.end_time DESC LIMIT 1000"
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert datetime objects to string for JSON serialization
            for row in rows:
                for key, value in row.items():
                    if isinstance(value, datetime):
                        row[key] = value.isoformat()
            
            cursor.close()
            return rows
        except Exception as e:
            logger.error(f"MariaDB Error: {e}")
            return [{"error": f"Database Error: {str(e)}. Ensure credentials in .env are correct."}]
        finally:
            if conn and conn.is_connected():
                conn.close()

    return await asyncio.to_thread(_fetch)


async def get_quick_stats_db() -> Dict[str, Any]:
    """
    Get quick stats directly from the database for the MCP agent.
    Returns:
        - monitorCount
        - agencyPerformance (0.0-1.0)
        - mttr (seconds)
    """

    def _calc():
        conn = None
        try:
            pool = get_db_pool()
            conn = pool.get_connection()
            cursor = conn.cursor(dictionary=True)

            # 1. Monitor Count (Active)
            cursor.execute("SELECT COUNT(*) as count FROM monitor WHERE active = 1")
            res_count = cursor.fetchone()
            monitor_count = res_count["count"] if res_count else 0

            # 2. Agency Performance (Avg 24h Uptime)
            cursor.execute("SELECT id FROM monitor WHERE active = 1")
            active_ids = [row["id"] for row in cursor.fetchall()]
            
            agency_performance = 0
            if active_ids:
                format_strings = ','.join(['%s'] * len(active_ids))
                query_perf = f"""
                    SELECT SUM(up) as total_up, SUM(down) as total_down
                    FROM stat_minutely
                    WHERE monitor_id IN ({format_strings})
                    AND timestamp >= (UNIX_TIMESTAMP(NOW()) - 86400)
                """
                cursor.execute(query_perf, tuple(active_ids))
                perf_res = cursor.fetchone()
                
                total_up = perf_res["total_up"] or 0
                total_down = perf_res["total_down"] or 0
                total = total_up + total_down
                
                if total > 0:
                    agency_performance = total_up / total
                else:
                    agency_performance = 1.0

            # 3. Downtime Resolution (MTTR) - Last 30 Days
            query_mttr = """
                SELECT monitor_id, status, time 
                FROM heartbeat 
                WHERE important = 1 
                AND time > DATE_SUB(NOW(), INTERVAL 30 DAY) 
                ORDER BY monitor_id, time ASC
            """
            cursor.execute(query_mttr)
            heartbeats = cursor.fetchall()
            
            total_downtime = 0
            resolved_incidents = 0
            pending_downtimes = {} # monitor_id -> downtime_start_datetime

            for hb in heartbeats:
                mid = hb["monitor_id"]
                status = hb["status"]
                time_val = hb["time"] # datetime object
                
                if status == 0: # DOWN
                    if mid not in pending_downtimes:
                        pending_downtimes[mid] = time_val
                elif status == 1: # UP
                    if mid in pending_downtimes:
                        start_time = pending_downtimes.pop(mid)
                        duration = (time_val - start_time).total_seconds()
                        total_downtime += duration
                        resolved_incidents += 1
            
            mttr = (total_downtime / resolved_incidents) if resolved_incidents > 0 else 0

            cursor.close()
            return {
                "monitorCount": monitor_count,
                "agencyPerformance": agency_performance,
                "mttr": mttr
            }

        except Exception as e:
            logger.error(f"MariaDB Calc Error: {e}")
            return {"error": str(e)}
        finally:
             if conn and conn.is_connected():
                conn.close()

    return await asyncio.to_thread(_calc)
