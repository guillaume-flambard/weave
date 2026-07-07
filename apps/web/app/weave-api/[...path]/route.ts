import type { NextRequest } from "next/server";

// Streaming reverse-proxy to the Weave API. Replaces the next.config `rewrites()`
// rule, which buffers the whole response before forwarding — fatal for the
// `/events` SSE stream (the live ingestion feed never arrived until the request
// closed). Piping `upstream.body` through a Response keeps the stream flowing
// chunk-by-chunk. `X-Accel-Buffering: no` also tells nginx (prod) not to buffer.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API = process.env.WEAVE_API_PROXY || "http://127.0.0.1:8787";

// Hop-by-hop headers must not be forwarded (RFC 7230 §6.1).
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

async function proxy(req: NextRequest, path: string[]) {
  const search = new URL(req.url).search;
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("content-length");
  // Strip hop-by-hop headers before forwarding: undici's fetch rejects a
  // forwarded `connection` header ("invalid connection header"), 500-ing
  // every proxied call.
  for (const key of HOP_BY_HOP) headers.delete(key);
  // EventSource (the /events SSE stream) can't set headers, so it can't send
  // the Bearer token that every other call carries. Inject it here, server-side,
  // instead of passing ?api_key= on the URL — that kept the key out of nginx
  // access logs. Regular fetches already carry their own header; don't override.
  if (!headers.has("authorization")) {
    const apiKey = process.env.NEXT_PUBLIC_WEAVE_API_KEY;
    if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
    signal: req.signal,
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half"; // required by undici to stream a request body
  }

  const upstream = await fetch(target, init);

  const resHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) resHeaders.set(key, value);
  });
  // Never let an intermediary buffer streaming responses (SSE in particular).
  resHeaders.set("Cache-Control", "no-cache, no-transform");
  resHeaders.set("X-Accel-Buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };
const handler = async (req: NextRequest, ctx: Ctx) => proxy(req, (await ctx.params).path);

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
