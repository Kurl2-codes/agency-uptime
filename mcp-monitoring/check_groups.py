import os
import sys
import asyncio
from dotenv import load_dotenv
import mysql.connector as mariadb

# Load env
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)

db_config = {
    'host': os.getenv('DB_HOST', os.getenv('UPTIME_KUMA_DB_HOST', 'localhost')),
    'user': os.getenv('DB_USER', os.getenv('UPTIME_KUMA_DB_USER', 'kuma')),
    'password': os.getenv('DB_PASSWORD', os.getenv('UPTIME_KUMA_DB_PASSWORD')),
    'database': os.getenv('DB_NAME', os.getenv('UPTIME_KUMA_DB_NAME', 'kuma')),
    'port': int(os.getenv('DB_PORT', os.getenv('UPTIME_KUMA_DB_PORT', 3306)))
}

def check_groups():
    try:
        conn = mariadb.connect(**db_config)
        cur = conn.cursor()
        
        # DEBUG: Check for parent relationship
        print("\n--- DEBUG: Monitors with Parent ---")
        cur.execute("SELECT id, name, type, parent FROM monitor WHERE parent IS NOT NULL")
        children_monitors = cur.fetchall()
        for m in children_monitors:
            print(m)

        # DEBUG: Dump monitor_group table content with columns
        cur.execute("SELECT * FROM monitor_group")
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        print(f"Columns: {columns}")
        for r in rows:
            print(dict(zip(columns, r)))
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_groups()
