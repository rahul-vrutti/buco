# Use the official Node.js 18 Alpine image
FROM node:18-alpine

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

# Expose the port the app runs on
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV MQTT_BROKER_URL=mqtt://mqtt:1883

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S buco -u 1001

# Change ownership of the app directory and front directory
RUN chown -R buco:nodejs /app
RUN chown -R buco:nodejs /app/front
RUN chown -R buco:nodejs /uploads 2>/dev/null || true

# Switch to non-root user
USER buco

# Start the application
CMD ["npm", "start"]