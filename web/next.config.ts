import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/graphql/:path*",
        destination: `${process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8000/graphql"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
