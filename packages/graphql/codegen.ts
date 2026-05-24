import type { CodegenConfig } from "@graphql-codegen/cli";

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:8000/graphql";

const config: CodegenConfig = {
  overwrite: true,
  schema: GRAPHQL_URL,
  documents: ["web/**/*.tsx", "web/**/*.ts", "fe/**/*.tsx", "fe/**/*.ts"],
  generates: {
    "packages/graphql/types.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        scalars: {
          JSON: "unknown",
          UUID: "string",
        },
        avoidOptionals: false,
        strictScalars: false,
      },
    },
    "web/lib/graphql.ts": {
      plugins: ["typescript-urql"],
      config: {
        withHooks: true,
        withComponent: false,
        urqlImportFrom: "urql",
      },
    },
  },
};

export default config;
