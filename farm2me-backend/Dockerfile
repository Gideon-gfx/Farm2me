# syntax=docker/dockerfile:1

# ---------- builder ----------
# Installs all deps, generates the Prisma client and compiles TypeScript.
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma needs OpenSSL to download/run its query engine on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

# `npm run build` runs `prisma generate && tsc` -> produces ./dist and the
# generated client in node_modules/.prisma.
RUN npm run build

# ---------- runner ----------
# Slim runtime image: production deps only + compiled output + generated client.
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Compiled app, the generated Prisma client and the schema (for migrate deploy).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/server.js"]
