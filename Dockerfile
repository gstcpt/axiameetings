# ─────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm install --prefer-offline

# ─────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (placeholder URL — only schema is needed at build time)
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Build Next.js for production
RUN npm run build

# ─────────────────────────────────────────────
# Stage 3: Production runner (lean image)
# ─────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./prisma.config.js

RUN mkdir -p public/uploads/meetings public/uploads/pvs

EXPOSE 3000

# Resolve any failed migrations then start
CMD ["sh", "-c", "npx prisma migrate resolve --applied 20260505093546_add_new_models 2>/dev/null || true && npx prisma migrate resolve --applied 20260506000000_add_chat_sessions 2>/dev/null || true && npx prisma migrate deploy && node server.mjs"]
