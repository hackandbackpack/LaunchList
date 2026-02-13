# ListPull Docker Image
# Single container with frontend + backend

# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Build arguments for Vite (must be available at build time)
ARG VITE_STORE_NAME="ListPull"
ARG VITE_STORE_EMAIL="contact@example.com"
ARG VITE_STORE_PHONE="555.123.4567"
ARG VITE_STORE_ADDRESS="123 Main Street"
ARG VITE_ORDER_PREFIX="LP"
ARG VITE_ORDER_HOLD_DAYS="7"
ARG VITE_MAX_FILE_SIZE_MB="1"
ARG VITE_MAX_DECKLIST_CARDS="500"
ARG VITE_SCRYFALL_RATE_LIMIT_MS="100"
ARG VITE_POKEMON_RATE_LIMIT_MS="200"
ARG VITE_AUTOCOMPLETE_DEBOUNCE_MS="200"
ARG VITE_API_URL="/api"

# Set as environment variables for the build
ENV VITE_STORE_NAME=$VITE_STORE_NAME
ENV VITE_STORE_EMAIL=$VITE_STORE_EMAIL
ENV VITE_STORE_PHONE=$VITE_STORE_PHONE
ENV VITE_STORE_ADDRESS=$VITE_STORE_ADDRESS
ENV VITE_ORDER_PREFIX=$VITE_ORDER_PREFIX
ENV VITE_ORDER_HOLD_DAYS=$VITE_ORDER_HOLD_DAYS
ENV VITE_MAX_FILE_SIZE_MB=$VITE_MAX_FILE_SIZE_MB
ENV VITE_MAX_DECKLIST_CARDS=$VITE_MAX_DECKLIST_CARDS
ENV VITE_SCRYFALL_RATE_LIMIT_MS=$VITE_SCRYFALL_RATE_LIMIT_MS
ENV VITE_POKEMON_RATE_LIMIT_MS=$VITE_POKEMON_RATE_LIMIT_MS
ENV VITE_AUTOCOMPLETE_DEBOUNCE_MS=$VITE_AUTOCOMPLETE_DEBOUNCE_MS
ENV VITE_API_URL=$VITE_API_URL

# Copy package files for frontend
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy frontend source code
COPY . .

# Build the frontend
RUN npm run build

# Build stage for backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install all dependencies (including dev for TypeScript build)
RUN npm ci

# Copy server source code
COPY server/ ./

# Build the server
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install better-sqlite3 build dependencies
RUN apk add --no-cache python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nodejs:nodejs /app/data

# Copy server package files and install production dependencies
COPY --from=backend-builder --chown=nodejs:nodejs /app/server/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Remove build dependencies after npm ci
RUN apk del python3 make g++

# Install sqlite3 CLI for backups
RUN apk add --no-cache sqlite

# Copy backup script
COPY scripts/backup.sh /app/scripts/backup.sh
RUN chmod +x /app/scripts/backup.sh

# Copy built server
COPY --from=backend-builder --chown=nodejs:nodejs /app/server/dist ./dist

# Copy built frontend
COPY --from=frontend-builder --chown=nodejs:nodejs /app/dist /app/public

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Environment variables for runtime
ENV PORT=3000
ENV DATABASE_PATH=/app/data/listpull.db
ENV NODE_ENV=production

# Start the server
CMD ["node", "dist/index.js"]
