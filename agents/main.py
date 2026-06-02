"""Entry point for the Structable agent service.

Run with:
    cd agents
    uvicorn main:app --reload --port 8001

Or via the LangGraph dev server (hot-reload, built-in Studio UI):
    langgraph dev          # uses langgraph.json in this directory
"""

import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from copilotkit import CopilotKitRemoteEndpoint, LangGraphAGUIAgent
from copilotkit.integrations.fastapi import add_fastapi_endpoint

load_dotenv()

# Import after load_dotenv so ANTHROPIC_API_KEY is available
from structable_agent.graph import graph  # noqa: E402

app = FastAPI(title="Structable Agent Service")
AGENT_NAME = "default"

sdk = CopilotKitRemoteEndpoint(
    agents=[
        LangGraphAGUIAgent(
            name=AGENT_NAME,
            description=(
                "AI assistant for Structable — can query tables, columns, and row data "
                "to help users explore and understand their information."
            ),
            graph=graph,
        )
    ],
)

add_fastapi_endpoint(app, sdk, "/copilotkit")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "agent": AGENT_NAME}


if __name__ == "__main__":
    host = os.getenv("AGENTS_HOST", "0.0.0.0")
    port = int(os.getenv("AGENTS_PORT", "8001"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
