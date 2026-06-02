from typing import Annotated
from langgraph.graph.message import AnyMessage, add_messages
from copilotkit.langgraph import CopilotKitState


class AgentState(CopilotKitState):
    """State for the Structable agent.

    Extends CopilotKitState so the frontend can read/write shared state
    (e.g. highlight a row the agent is talking about).
    """

    messages: Annotated[list[AnyMessage], add_messages]
