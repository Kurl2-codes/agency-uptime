import os
import json
import getpass
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
CONFIG_PATH = PROJECT_ROOT / "mcp_server_config.json"
ENV_PATH = PROJECT_ROOT / ".env"

def main():
    print("="*60)
    print(" 🚀 SRE AGENT - TEAM SETUP WIZARD")
    print("="*60)
    print("This script will configure your connection to Uptime Kuma")
    print("and set up your environment variables.\n")

    # 1. OpenAI Configuration
    print("--- 1. LLM Configuration ---")
    openai_key = input("Enter your OpenAI API Key (sk-...): ").strip()
    
    # 2. Uptime Kuma Configuration
    print("\n--- 2. Uptime Kuma Configuration ---")
    kuma_url = input("Uptime Kuma URL [http://localhost:3001]: ").strip() or "http://localhost:3001"
    kuma_user = input("Uptime Kuma Username: ").strip()
    kuma_pass = getpass.getpass("Uptime Kuma Password: ").strip()

    # 3. Database (Optional)
    print("\n--- 3. Database (MariaDB) ---")
    print("(Press Enter to skip if not using historical analysis)")
    db_host = input("DB Host [localhost]: ").strip() or "localhost"
    db_user = input("DB User [kuma]: ").strip() or "kuma"
    db_pass = getpass.getpass("DB Password [kuma]: ").strip() or "kuma"

    # --- ACTION: Write .env ---
    print("\n[+] Writing .env file...")
    env_content = f"""OPENAI_API_KEY={openai_key}
MARIADB_USER={db_user}
MARIADB_PASSWORD={db_pass}
MARIADB_HOST={db_host}
MARIADB_DATABASE=kuma
"""
    with open(ENV_PATH, "w") as f:
        f.write(env_content)

    # --- ACTION: Write mcp_server_config.json ---
    print("[+] Writing mcp_server_config.json...")
    
    # Determine npx command based on OS (heuristic)
    import sys
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"

    config_data = {
        "mcpServers": {
            "uptime-kuma": {
                "command": npx_cmd,
                "args": ["-y", "@davidfuchs/mcp-uptime-kuma"],
                "env": {
                    "UPTIME_KUMA_URL": kuma_url,
                    "UPTIME_KUMA_USERNAME": kuma_user,
                    "UPTIME_KUMA_PASSWORD": kuma_pass
                }
            }
        }
    }
    
    with open(CONFIG_PATH, "w") as f:
        json.dump(config_data, f, indent=2)

    print("\n" + "="*60)
    print(" ✅ SETUP COMPLETE!")
    print("="*60)
    print("You can now start the agent:")
    print("  Docker: docker-compose up --build")
    print("  Local:  python src/api.py")
    print("="*60)

if __name__ == "__main__":
    main()
