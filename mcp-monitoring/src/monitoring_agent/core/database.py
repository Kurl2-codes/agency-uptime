import os
import asyncio
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
import mysql.connector

logger = logging.getLogger("monitoring_agent.database")

async def query_mariadb_history(monitor_id: Optional[int] = None, start_date: str = "2025-12", downtime_only: bool = True) -> List[Dict[str, Any]]:
    """
    Query Uptime Kuma's MariaDB database for historical heartbeats.
    - monitor_id: Filter by specific monitor.
    - start_date: Format YYYY-MM (e.g., 2025-12).
    - downtime_only: If true, only returns records where status is not UP (status != 1).
    """
    db_host = os.getenv("DB_HOST", "localhost")
    db_user = os.getenv("DB_USER", "kuma")
    db_pass = os.getenv("DB_PASSWORD") # No default for security
    db_name = os.getenv("DB_NAME", "kuma")

    if not db_pass:
        return [{"error": "DB_PASSWORD environment variable is not set."}]

    def _fetch():
        try:
            conn = mysql.connector.connect(
                host=db_host,
                user=db_user,
                password=db_pass,
                database=db_name
            )
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
            conn.close()
            return rows
        except Exception as e:
            logger.error(f"MariaDB Error: {e}")
            return [{"error": f"Database Error: {str(e)}. Ensure credentials in .env are correct."}]

    return await asyncio.to_thread(_fetch)
