"use client";

import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

type Props = {
  children: React.ReactNode;
};

export default function CopilotProvider({ children }: Props) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          title: "Structable AI",
          initial:
            "Hi! I can query your tables, explore columns, and help you understand your data.\n\nTry: *\"Show the top 10 repos by 7-day star growth\"*",
          placeholder: "Ask about your data…",
        }}
      >
        {children}
      </CopilotSidebar>
    </CopilotKit>
  );
}
