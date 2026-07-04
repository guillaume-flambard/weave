# weave-web — Next.js 15. Serves the app and proxies /weave-api → weave-api (next.config rewrite).
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# next build freezes rewrite destinations into the routes manifest, so the
# upstream must be set at BUILD time (runtime env is too late).
ENV WEAVE_API_PROXY=http://weave-api:8787
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3200
CMD ["pnpm", "start"]
