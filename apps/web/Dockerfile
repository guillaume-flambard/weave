# weave-web — Next.js 15. Serves the app and proxies /weave-api → weave-api (next.config rewrite).
# Pinned to an exact patch: the proxy uses Node's global fetch (built-in undici), whose
# version tracks the Node image. A floating `22` tag silently bumped undici on rebuild and
# started rejecting the forwarded `connection` header (500s). Bump deliberately, not by drift.
FROM node:22.23.1-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# next build freezes rewrite destinations into the routes manifest, so the
# upstream must be set at BUILD time (runtime env is too late).
ARG NEXT_PUBLIC_WEAVE_API_KEY=
ENV NEXT_PUBLIC_WEAVE_API_KEY=$NEXT_PUBLIC_WEAVE_API_KEY
ENV WEAVE_API_PROXY=http://weave-api:8787
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3200
CMD ["pnpm", "start"]
