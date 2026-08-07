# ---- Build stage: install everything and build the client ----
FROM node:20-slim AS build
WORKDIR /app

# Build tooling for native deps (better-sqlite3) if a prebuilt isn't available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY client/package.json client/package.json
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: production deps + server + built client ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY client/package.json client/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000
CMD ["node", "server/index.js"]
