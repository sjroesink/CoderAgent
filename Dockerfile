# ===== Stage 1: Build =====
FROM node:22-alpine AS builder
WORKDIR /app

# Build tools needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install all dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build (tsup without DTS + next build)
# --no-dts: type declarations are not needed to run the application
COPY . .
RUN npx tsup --no-dts && npm run build:web

# ===== Stage 2: Production =====
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Build tools needed to rebuild native modules for this platform
RUN apk add --no-cache python3 make g++

# Install production dependencies and rebuild native modules
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install tsx globally to execute the TypeScript server entrypoint
RUN npm install -g tsx

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Next.js needs TypeScript at runtime to load next.config.ts
COPY --from=builder /app/node_modules/typescript ./node_modules/typescript

# Copy source (needed for server.ts entrypoint and Next.js config resolution)
COPY src ./src

# Data directory for SQLite database
# Mount a volume here for persistence:
#   docker run -v agentcoder-data:/data ...
RUN mkdir -p /data
ENV DATABASE_PATH=/data/agentcoder.db
VOLUME ["/data"]

EXPOSE 4555

CMD ["tsx", "src/web/server.ts"]
