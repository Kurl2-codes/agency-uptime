import asyncio
import sys
import os
import logging
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.prompt import Prompt
from rich.table import Table

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Import from the new package
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.monitoring_agent.core.config import load_mcp_config, SYSTEM_PROMPT
from src.monitoring_agent.core.tools import create_langchain_tools
from src.monitoring_agent.core.graph import build_graph
from src.monitoring_agent.core.utils import setup_logging

logger = setup_logging("cli_agent")
console = Console()

# --- Main Execution ---
async def run_chat_loop():
    # Load config via helper
    try:
        uptime_kuma_config = load_mcp_config()
    except Exception as e:
        console.print(f"[bold red]Configuration Error: {e}[/bold red]")
        return

    server_params = StdioServerParameters(
        command=uptime_kuma_config["command"],
        args=uptime_kuma_config["args"],
        env={**os.environ, **uptime_kuma_config["env"]},
    )

    # Validation: Ensure required variables are present
    required_vars = ["UPTIME_KUMA_URL", "UPTIME_KUMA_USERNAME", "UPTIME_KUMA_PASSWORD"]
    # Check both the merged env (in case they are in os.environ) and the config
    # We check validation against what we are about to pass to the server
    missing = [v for v in required_vars if not server_params.env.get(v)]
    
    if missing:
        console.print(Panel(f"[bold red]missing required environment variables:[/bold red]\n{', '.join(missing)}\n\n[yellow]Please check your .env file. It might be empty or have encoding issues (UTF-16 vs UTF-8).[/yellow]", title="Configuration Error", border_style="red"))
        return

    console.print(Panel.fit("[bold green]Connecting to Uptime Kuma MCP Server...[/bold green]"))
    
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                console.print("[bold blue]Connected![/bold blue]")
                
                # Add a small delay for Uptime Kuma to finish internal login
                with console.status("[bold yellow]Authenticating with Uptime Kuma...[/bold yellow]", spinner="dots"):
                    await asyncio.sleep(4)
                
                # 1. Create Tools
                with console.status("[bold green]Loading Tools...[/bold green]", spinner="dots"):
                    tools = await create_langchain_tools(session)
                
                # Show loaded tools (Rich UI logic kept here)
                table = Table(title="Available Tools", show_header=True, header_style="bold magenta")
                table.add_column("Tool Name", style="cyan")
                table.add_column("Description", style="dim")
                for t in tools:
                     table.add_row(t.name, (t.description or "")[:50] + "...")
                console.print(table)
                
                # 2. Setup Model
                if not os.environ.get("OPENAI_API_KEY"):
                    console.print("[bold red]Error: OPENAI_API_KEY not found.[/bold red]")
                    return
    
                model = ChatOpenAI(model="gpt-5-mini")
                
                # 3. Build Graph
                graph = build_graph(model, tools)
                
                # 4. Chat Loop
                console.print(Panel("[bold yellow]System Ready. I am your SRE Assistant.[/bold yellow]\nType 'exit' to quit.", title="SRE Agent", border_style="yellow"))
                
                config = {"configurable": {"thread_id": "1"}} 
                first_turn = True
                
                while True:
                    user_input = Prompt.ask("\n[bold cyan]User[/bold cyan]")
                    if user_input.lower() in ["exit", "quit"]:
                        break
                    
                    input_messages = []
                    if first_turn:
                         input_messages.append(SystemMessage(content=SYSTEM_PROMPT))
                         first_turn = False
                    
                    input_messages.append(HumanMessage(content=user_input))
                    
                    # Run the graph
                    with console.status("[bold green]Analyzing...[/bold green]", spinner="dots"):
                        async for event in graph.astream({"messages": input_messages}, config=config):
                            for key, value in event.items():
                                 if key == "reasoner":
                                    msg = value["messages"][-1]
                                    console.print(Panel(Markdown(msg.content), title="SRE Assistant", border_style="green"))

    except BaseException as e:
        # Catch BaseException to capture BaseExceptionGroup (Python 3.11+)
        # We must be careful not to suppress KeyboardInterrupt unless intended (which we re-raise)
        if isinstance(e, KeyboardInterrupt):
            raise e

        # Check for specific server-crashed errors
        import anyio
        
        def is_server_crash(exc):
            if isinstance(exc, (anyio.ClosedResourceError, anyio.EndOfStream)):
                return True
            if isinstance(exc, BaseExceptionGroup):
                return any(is_server_crash(sub) for sub in exc.exceptions)
            return False

        if is_server_crash(e):
            console.print(Panel(f"[bold red]Connection Failed[/bold red]\nThe MCP server exited unexpectedly.\n\n[yellow]Possible causes:[/yellow]\n1. Invalid Credentials in .env (UPTIME_KUMA_USERNAME/PASSWORD)\n2. Uptime Kuma URL is unreachable ({uptime_kuma_config['env'].get('UPTIME_KUMA_URL')})\n3. Server process failed to start.", title="Fatal Error", border_style="red"))
            return

        # Re-raise explicit other errors or print them
        console.print(f"[bold red]Runtime Error: {e}[/bold red]")
        logger.error(f"Runtime error: {e}", exc_info=True)

if __name__ == "__main__":
    try:
        if sys.platform == 'win32':
             asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(run_chat_loop())
    except KeyboardInterrupt:
        console.print("\n[bold red]Goodbye![/bold red]")
    except Exception as e:
        console.print(f"[bold red]Fatal Error: {e}[/bold red]")
