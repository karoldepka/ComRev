import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphHttpAgent } from "@copilotkit/runtime/langgraph";

// FastAPI agent service started by `uv run python main.py` (default port 8001).
const AGENTS_URL = process.env.AGENTS_URL ?? "http://localhost:8001/copilotkit";

const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
  endpoint: "/api/copilotkit",
  runtime: new CopilotRuntime({
    agents: {
      structable_agent: new LangGraphHttpAgent({ url: AGENTS_URL }),
    },
  }),
});

export const POST = handleRequest;
