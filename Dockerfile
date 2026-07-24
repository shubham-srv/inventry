# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js (standalone) app + Prisma, targeting
# Azure Container Apps. Debian-slim base for BOTH build and run so the Prisma
# query engine generated at build time matches the runtime OS (avoids the
# "query engine not found / wrong binary" trap).

FROM node:20-slim AS base
# OpenSSL is required by Prisma's engine; present on debian-slim but make it explicit.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ---- deps: install node_modules from a clean lockfile ----------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate Prisma client + build Next ---------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client must be generated before the Next build compiles code that imports it.
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal image serving .next/standalone ------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Run as a non-root user.
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server + static assets + public files.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Belt-and-suspenders: ensure the generated Prisma client + native engine ship
# even if Next's output tracing misses the engine binary.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
# The standalone server honours PORT/HOSTNAME. ACA ingress targets port 3000.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
