# frontend/Dockerfile - Updated with build args
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY . .

# Build arguments for environment variables
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG BETTER_AUTH_URL
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG RAZORPAY_KEY_ID
ARG RAZORPAY_KEY_SECRET
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET

# Set environment variables for build
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:4937}
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL:-http://localhost:4936}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL:-http://localhost:4937}
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=${NEXT_PUBLIC_RAZORPAY_KEY_ID:-rzp_test_RDvC9jQ6pk6HZy}
ENV RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID:-rzp_test_RDvC9jQ6pk6HZy}
ENV RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET:-B0UXGmgDS26Et4ph661H3kCx}
ENV DATABASE_URL=${DATABASE_URL:-postgresql://testforge:tfg_G8xR7vN2mK4pY9qW6dC1sH5uJ3aL8e@postgres:5432/testforge}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-ad85656193e23d2e5b8f21fa99064d1499d7d75200d63efae64b3f3b39ee2df4}

RUN pnpm build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]