# weave-web — Next.js 15. Serves the app and proxies /weave-api → weave-api (next.config rewrite).
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3200
CMD ["pnpm", "start"]
