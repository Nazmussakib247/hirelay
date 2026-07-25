# ── Stage 1: build the static bundle ───────────────────────────────────────
FROM node:20-alpine AS build

# API base URL baked into the bundle. Empty (default) → the SPA uses the
# relative "/api" path and the nginx reverse proxy below routes it to the
# backend container — works from any browser on any host.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: serve via nginx ───────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Use 127.0.0.1 (not localhost): inside alpine, localhost can resolve to IPv6
# ::1 first, but nginx below listens on IPv4 only (listen 80) — so a
# localhost healthcheck connects to ::1:80, gets refused, and the container is
# wrongly reported "unhealthy" while it serves fine on IPv4.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1
