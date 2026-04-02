"""
ApoloSLAWatcherAgent — Entry Point

Run with:
  uv run python -m agent_a2a
  or
  python __main__.py
"""

import os

import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from agent import ApoloSLAWatcherAgent

PORT = int(os.getenv("AGENT_PORT", "8080"))
HOST = os.getenv("AGENT_HOST", "0.0.0.0")
PUBLIC_BASE_URL = os.getenv("AGENT_PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or f"http://localhost:{PORT}"

agent_card = AgentCard(
    name="ApoloSLAWatcherAgent",
    description=(
        "External orchestration agent for Apolo escrow. "
        "Monitors HTTP SLA conditions, produces a deterministic approved/rejected decision, "
        "and triggers on-chain escrow settlement via the Apolo solver."
    ),
    url=f"{PUBLIC_BASE_URL.rstrip('/')}/",
    version="1.0.0",
    defaultInputModes=["application/json"],
    defaultOutputModes=["application/json", "text/plain"],
    capabilities=AgentCapabilities(streaming=True),
    skills=[
        AgentSkill(
            id="sla_watch_settle",
            name="SLA Watch & Settle",
            description=(
                "Check an HTTP endpoint N times, decide approved/rejected, "
                "submit to Apolo solver, and return on-chain settlement proof."
            ),
            tags=["sla", "escrow", "settlement", "bsc", "mainnet", "apolo", "a2a"],
            inputModes=["application/json"],
            outputModes=["application/json", "text/plain"],
            examples=[
                '{"intentHash":"0xabc...", "slaUrl":"https://api.example.com/health", '
                '"expectedStatus":200, "checksRequired":3}'
            ],
        )
    ],
)

request_handler = DefaultRequestHandler(
    agent_executor=ApoloSLAWatcherAgent(),
    task_store=InMemoryTaskStore(),
)

app = A2AStarletteApplication(
    agent_card=agent_card,
    http_handler=request_handler,
)

if __name__ == "__main__":
    print(f"ApoloSLAWatcherAgent starting on http://{HOST}:{PORT}")
    print(f"Agent card: {PUBLIC_BASE_URL.rstrip('/')}/.well-known/agent.json")
    uvicorn.run(app.build(), host=HOST, port=PORT)
