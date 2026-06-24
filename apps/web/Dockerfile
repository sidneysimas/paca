# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder

WORKDIR /build

# Install dependencies first for layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM caddy:2-alpine

# Replace the default Caddy config with our SPA config
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built assets from the build stage
COPY --from=builder /build/dist /srv

EXPOSE 3000

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
