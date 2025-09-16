# Use the official Node.js 18 Alpine image
FROM node:18-alpine

# Install Docker CLI and other utilities
RUN apk add --no-cache docker-cli curl bash git

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the application files
COPY server.js ./
COPY dockerBuildManager.js ./
COPY scripts/ ./scripts/
COPY front/ ./front/

# Create uploads directory with proper permissions
RUN mkdir -p /uploads
RUN chmod 777 /uploads

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S buco -u 1001

# Add user to docker group (this will work when docker socket is mounted)
RUN addgroup -g 999 -S docker 2>/dev/null || true
RUN adduser buco docker 2>/dev/null || true

# Change ownership of the app directory
RUN chown -R buco:nodejs /app
RUN chown -R buco:nodejs /app/front

# Don't switch to non-root user yet - we need root permissions for Docker
# USER buco will be set at runtime if needed

# Expose the port the app runs on
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MQTT_BROKER_URL=mqtt://100.103.254.213:1883

# Start the application as root to access Docker socket
CMD ["node", "server"]