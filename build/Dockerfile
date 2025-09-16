# Use the official Node.js 18 Alpine image
FROM node:18-alpine

# Install Docker CLI and curl for health checks
RUN apk add --no-cache docker-cli curl

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the application files
COPY server.js ./
COPY front/ ./front/

# Create uploads directory
RUN mkdir -p ../uploads
RUN mkdir -p ../uploads/docker-images

# Expose the port the app runs on
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MQTT_BROKER_URL=mqtt://100.103.254.213:1883

# Change ownership of the app directory and uploads directory
RUN chown -R node:node /app
RUN mkdir -p /uploads && chown -R node:node /uploads
RUN mkdir -p /uploads/docker-images && chown -R node:node /uploads/docker-images

# Note: Running as root to access Docker socket
# In production, consider using Docker-in-Docker or Docker socket proxy
USER root

# Start the application
CMD ["npm", "start"]