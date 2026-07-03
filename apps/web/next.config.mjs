/** @type {import('next').NextConfig} */
const apiProxy = process.env.WEAVE_API_PROXY || "http://127.0.0.1:8787";

const nextConfig = {
  async rewrites() {
    return [{ source: "/weave-api/:path*", destination: `${apiProxy}/:path*` }];
  },
  env: {
    // Same-origin proxy avoids CORS issues between localhost and 127.0.0.1 in dev.
    NEXT_PUBLIC_WEAVE_API: process.env.NEXT_PUBLIC_WEAVE_API || "/weave-api",
  },
};

export default nextConfig;
