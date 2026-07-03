FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy migration files
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/drizzle.config.ts ./
COPY frontend/drizzle ./drizzle
COPY frontend/src ./src

# Database URL should come from environment
CMD ["pnpm", "db:setup"]