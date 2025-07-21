FROM node:18-slim

# Install system dependencies for OCR, PDF processing, and ONNX Runtime
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    libpng-dev \
    libfreetype6-dev \
    # ONNX Runtime dependencies
    libc6-dev \
    libgcc-s1 \
    libstdc++6 \
    libgomp1 \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create necessary directories
RUN mkdir -p uploads logs temp

# Set permissions for node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3001

# Health check - using localhost instead of 127.0.0.1 for better Docker compatibility
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the server with proper environment variables
CMD ["node", "dist/index.js"]