# Stage 1: Builder
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy source code and build
COPY src ./src
RUN npm run build || npx tsc

# Stage 2: Production runtime
FROM mcr.microsoft.com/playwright:v1.59.0-jammy

WORKDIR /app

# Set node environment
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev && npm install playwright-core

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Expose API port
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
