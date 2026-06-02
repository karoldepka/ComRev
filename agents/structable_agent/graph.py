"""LangGraph ReAct agent for Structable.

LLM is selected by env vars:
  OLLAMA_MODEL=llama3.2          → uses Ollama (local, no API key)
  ANTHROPIC_API_KEY + ANTHROPIC_MODEL → uses Claude (default)
"""

import os

from langchain_core.language_models import BaseChatModel
from langgraph.prebuilt import create_react_agent

from structable_agent.tools import TOOLS

_SYSTEM_PROMPT = """\
You are an AI assistant embedded in Structable — an open-source alternative to Airtable and
Google Sheets. You help users explore, understand, and reason about their table data.

You have access to these tools:
- list_tables        — see all tables
- list_columns       — inspect a table's column schema (types, data paths, groups)
- query_rows         — fetch rows with optional sort and filter
- get_row            — look up one row by id

Guidelines:
- Keep answers concise. For tabular results, use a Markdown table with the most relevant columns.
- When the user asks about "repos" or "projects", assume table_id="github_repos" unless specified.
- Stars diff columns (stars_diff.6h, .12h, .24h … .30d) show star gain over each time window.
- If a query returns many rows, summarise the top results rather than listing all of them.
- Never invent data — always call a tool when you need actual values.
"""


def _build_llm() -> BaseChatModel:
    ollama_model = os.getenv("OLLAMA_MODEL")
    if ollama_model:
        from langchain_ollama import ChatOllama
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        return ChatOllama(model=ollama_model, base_url=base_url, temperature=0)

    from langchain_anthropic import ChatAnthropic
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    return ChatAnthropic(model=model, temperature=0, streaming=True)


graph = create_react_agent(
    model=_build_llm(),
    tools=TOOLS,
    prompt=_SYSTEM_PROMPT,
)
