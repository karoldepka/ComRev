import { createClient, cacheExchange, fetchExchange, subscriptionExchange } from "urql";
import { createClient as createWSClient } from "graphql-ws";

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:8000/graphql";

const WS_URL = GRAPHQL_URL.replace(/^http/, "ws");

function makeClient() {
  const wsClient =
    typeof window !== "undefined"
      ? createWSClient({ url: WS_URL })
      : null;

  return createClient({
    url: GRAPHQL_URL,
    exchanges: [
      cacheExchange,
      fetchExchange,
      ...(wsClient
        ? [
            subscriptionExchange({
              forwardSubscription(request) {
                const input = { ...request, query: request.query ?? "" };
                return {
                  subscribe(sink) {
                    const unsubscribe = wsClient.subscribe(input, sink);
                    return { unsubscribe };
                  },
                };
              },
            }),
          ]
        : []),
    ],
  });
}

export { makeClient };
