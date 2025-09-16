# Use the official Node.js 18 Alpine image
FROM node:18-alpine

# Install Docker CLI and necessary tools for Docker-in-Docker
RUN apk add --no-cache \
    docker-cli \
    docker-cli-compose \
    curl \
    bash

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the application files
COPY server.js ./
COPY dockerBuilder.js ./
COPY front/ ./front/
COPY docker-entrypoint.sh ./

# Make entrypoint script executable
RUN chmod +x docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p ../uploads

# Expose the port the app runs on
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MQTT_BROKER_URL=mqtt://100.103.254.213:1883
ENV DOCKER_CONTAINER=true

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S buco -u 1001

# Add buco user to docker group (if it exists) 
RUN addgroup -g 999 -S docker 2>/dev/null || true
RUN adduser buco docker 2>/dev/null || true

# Change ownership of the app directory and front directory
RUN chown -R buco:nodejs /app
RUN chown -R buco:nodejs /app/front
RUN chown -R buco:nodejs /uploads 2>/dev/null || true

# Switch to non-root user
USER buco

# Set entrypoint
ENTRYPOINT ["./docker-entrypoint.sh"]

# Start the application
CMD ["npm", "start"]