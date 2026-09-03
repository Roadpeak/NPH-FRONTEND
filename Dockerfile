# syntax=docker/dockerfile:1.7
# NPH-FRONTEND — Next.js 15, standalone output (see next.config.ts).

FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_API_URL must be present at BUILD time — Next inlines it
# into the client bundle. Runtime env changes don't propagate.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm build

FROM node:20-alpine AS runtime
RUN apk add --no-cache libc6-compat tini
WORKDIR /app
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
# Standalone output ships its own minimal server.js + node_modules; no
# runtime pnpm needed.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3100
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
