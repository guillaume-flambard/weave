/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_WEAVE_API: process.env.NEXT_PUBLIC_WEAVE_API || "http://127.0.0.1:8787",
  },
};

export default nextConfig;
