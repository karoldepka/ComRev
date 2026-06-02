import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
  langGraphPlatformEndpoint,
} from "@copilotkit/runtime";

// The LangGraph dev/serve server (default port 2024).
// Override at deploy time via LANGGRAPH_URL env var.
const LANGGRAPH_URL = process.env.LANGGRAPH_URL ?? "http://localhost:2024";

const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
  endpoint: "/api/copilotkit",
  runtime: new CopilotRuntime({
    remoteEndpoints: [
      langGraphPlatformEndpoint({
        deploymentUrl: LANGGRAPH_URL,
        agents: [
          {
            name: "structable_agent",
            description:
              "AI assistant for Structable — can query tables, columns, and row data.",
          },
        ],
      }),
    ],
  }),
});

export const POST = handleRequest;
