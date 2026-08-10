# syntax=docker/dockerfile:1
#
# Production image for Cloud Run.
#
# Multi-stage so the runtime image carries only the Next.js standalone output:
# no source, no dev dependencies, no build toolchain.
#
# Node 22 (Next.js 16 requires >= 20.9). Pinned to the Alpine variant to keep
# the image small; Cloud Run cold starts scale with image size.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` against the committed lockfile: reproducible, and fails if the
# lockfile and package.json disagree.
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# must be present here. These are browser-safe by definition — the publishable
# key is constrained by RLS. No privileged key is ever passed into a build.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG GIT_COMMIT_SHA=unknown
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    GIT_COMMIT_SHA=$GIT_COMMIT_SHA \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Run unprivileged. `node` (uid 1000) ships with the base image.
RUN mkdir .next && chown node:node .next

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8080

# Cloud Run sends SIGTERM; node as PID 1 handles it via the standalone server.
CMD ["node", "server.js"]
