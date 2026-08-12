FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# backend URL has to be supplied here, not as a runtime env var later.
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
# Derived from git in CI (deploy.yml) -- "which build are you on" is the
# first question in any store support ticket (docs/MOBILE_AND_STEAM_PLAN.md
# §4.2). Unset here (local dev) falls back to config.ts's "dev"/"0".
ARG NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_BUILD_NUMBER
ENV NEXT_PUBLIC_BUILD_NUMBER=$NEXT_PUBLIC_BUILD_NUMBER
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default, and Next's standalone
# server binds to $HOSTNAME if set -- without this override it ends up bound
# to the container's own IP instead of 0.0.0.0, which breaks localhost-based
# healthchecks (and is fragile in general, even though Caddy reaching it by
# container IP happens to still work).
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
