# Agency Uptime Custom Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
# python3/make/g++ for native modules (sqlite3)
# git/tzdata for app functionality
RUN apk add --no-cache python3 make g++ git tzdata

# Copy source code
COPY . .

# 1. Install all dependencies (including dev)
RUN npm ci

# 2. Build the Agency Uptime Frontend
RUN npm run build

# 3. Remove dev dependencies to clean up image
RUN npm prune --production

# Create data directory for volume mapping
RUN mkdir -p /app/data

# Expose the port
EXPOSE 3001

# Set Container Environment
ENV UPTIME_KUMA_IS_CONTAINER=1
ENV DATA_DIR=/app/data
ENV NODE_ENV=production

# Start Server
CMD ["node", "server/server.js"]
