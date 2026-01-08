## Folder Structure

The project follows a modular "domain-driven" layout within `src/`:

```
src/
├── monitoring_agent/       # Core Package
│   ├── core/               # Business Logic
│   │   ├── config.py       # Configuration & Environment
│   │   ├── database.py     # Database Interaction (MariaDB)
│   │   ├── graph.py        # LangGraph Definition
│   │   ├── tools.py        # Tool Aggregation (MCP + Local)
│   │   └── utils.py        # Shared Utilities (Logging)

├── agent.py                # CLI Entry Point
└── api.py                  # API Entry Point (FastAPI)
```

## Development Guidelines

### 1. Separation of Concerns
- **Logic** goes in `monitoring_agent/core`.
- **Presentation** (fastAPI routes, Rich printing) goes in `api.py` or `agent.py`.
- Do not duplicate logic between the CLI and API.

### 2. Logging
- Use the centralized logger from `src.monitoring_agent.core.utils`.
- Logs are saved to `logs/agent.log`.

```python
from src.monitoring_agent.core.utils import setup_logging
logger = setup_logging(__name__)
logger.info("Something happened")
```

### 3. Adding Tools
To add a new tool:
1. Define the logic in `src/monitoring_agent/core/tools.py` (or a sidebar file if complex).
2. Register it in `create_langchain_tools`.

### 4. Code Style
- Use type hints (`def foo(x: int) -> str:`).
- Keep functions small and focused.
- Run tests in `src/` before committing.
