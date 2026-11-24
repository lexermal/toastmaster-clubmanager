# Build: docker build --build-context tmclub-api=../toastmaster-club-api -t clubmanager .
# (docker compose does this for you, see docker-compose.yml)
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends xvfb xauth python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# tmclub-api is linked as "../toastmaster-club-api" until it's published on npm.
WORKDIR /app/toastmaster-club-api
COPY --from=tmclub-api package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY --from=tmclub-api src ./src
RUN pnpm install --frozen-lockfile && pnpm build \
  # easy-Speak sits behind Cloudflare, which rejects headless Chromium: the worker runs a real one under xvfb.
  && pnpm exec playwright install --with-deps chromium

WORKDIR /app/clubmanager
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

ENV NODE_ENV=production DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["./scripts/start.sh"]
