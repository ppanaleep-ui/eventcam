# PhotoWish — production container.
# Kept intentionally simple (no standalone output) so the Prisma CLI is present
# at runtime to apply migrations before the server starts.

FROM node:22-slim AS base
# Prisma needs OpenSSL for its query engine.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Dependencies ---------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- Build ----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Generate the Prisma client and build Next. (DATABASE_URL isn't needed to build.)
RUN npx prisma generate && npx next build

# --- Runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs

# Uploaded images live here; mount a volume so they survive restarts.
RUN mkdir -p storage/uploads

EXPOSE 3000

# Apply any pending DB migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT}"]
