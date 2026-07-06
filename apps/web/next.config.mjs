/** @type {import('next').NextConfig} */
// The /weave-api/* proxy is a streaming Route Handler (app/weave-api/[...path]/route.ts),
// NOT a rewrite — rewrites buffer the whole response, which stalls the SSE feed.
const nextConfig = {
  env: {
    // Same-origin proxy avoids CORS issues between localhost and 127.0.0.1 in dev.
    NEXT_PUBLIC_WEAVE_API: process.env.NEXT_PUBLIC_WEAVE_API || "/weave-api",
  },
};

export default nextConfig;
