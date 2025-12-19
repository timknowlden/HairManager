# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server files
COPY server.js ./
COPY database ./database
COPY middleware ./middleware
COPY routes ./routes

# Read version from package.json and add as label
ARG VERSION=unknown
LABEL org.opencontainers.image.version="${VERSION}"
LABEL version="${VERSION}"

# Create directory for database and set permissions
RUN mkdir -p /app/data && chmod 755 /app/data

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the server
CMD ["node", "server.js"]

