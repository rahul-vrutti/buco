#!/bin/bash

# Container startup script for Docker-in-Docker setup
# This script runs inside the container to set up Docker access

echo "🚀 Starting Buco container with Docker-in-Docker support"

# Check if Docker socket is mounted
if [ -S /var/run/docker.sock ]; then
    echo "✅ Docker socket mounted successfully"
    
    # Check Docker access
    if docker version > /dev/null 2>&1; then
        echo "✅ Docker client can communicate with daemon"
    else
        echo "❌ Docker client cannot communicate with daemon"
        echo "💡 Check container permissions and socket mounting"
    fi
else
    echo "❌ Docker socket not found at /var/run/docker.sock"
    echo "💡 Container should be run with: -v /var/run/docker.sock:/var/run/docker.sock"
fi

# Check if we can access the subco directory
if [ -d "/subco" ]; then
    echo "✅ Subco source directory mounted"
else
    echo "⚠️  Subco source directory not found - subco builds will fail"
fi

# Check if uploads directory is writable
if [ -w "/uploads" ]; then
    echo "✅ Uploads directory is writable"
else
    echo "⚠️  Uploads directory is not writable"
fi

# Check registry connectivity
echo "🔍 Testing registry connectivity..."
if curl -s http://100.103.254.213:5001/v2/ > /dev/null; then
    echo "✅ Registry is accessible at 100.103.254.213:5001"
else
    echo "⚠️  Registry is not accessible at 100.103.254.213:5001"
fi

echo "🎯 Starting Node.js application..."
exec "$@"