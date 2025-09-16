#!/bin/bash

# Script to configure Docker daemon for insecure registry on Linux
# Usage: sudo ./configure-docker-registry.sh

REGISTRY="100.103.254.213:5001"
DAEMON_CONFIG="/etc/docker/daemon.json"

echo "🐳 Docker Registry Configuration for Linux"
echo ""
echo "Registry: $REGISTRY"
echo "Config file: $DAEMON_CONFIG"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    echo "Usage: sudo $0"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

# Backup existing daemon.json if it exists
if [ -f "$DAEMON_CONFIG" ]; then
    echo "📋 Backing up existing daemon.json..."
    cp "$DAEMON_CONFIG" "${DAEMON_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create /etc/docker directory if it doesn't exist
mkdir -p /etc/docker

# Create or update daemon.json
echo "🔧 Configuring Docker daemon for insecure registry..."

if [ -f "$DAEMON_CONFIG" ]; then
    # Parse existing config and add insecure registry
    python3 -c "
import json
import sys

try:
    with open('$DAEMON_CONFIG', 'r') as f:
        config = json.load(f)
except:
    config = {}

if 'insecure-registries' not in config:
    config['insecure-registries'] = []

if '$REGISTRY' not in config['insecure-registries']:
    config['insecure-registries'].append('$REGISTRY')

with open('$DAEMON_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)

print('✅ Updated daemon.json')
" 2>/dev/null || {
    # Fallback if python3 is not available
    cat > "$DAEMON_CONFIG" << EOF
{
  "insecure-registries": [
    "$REGISTRY"
  ]
}
EOF
    echo "✅ Created new daemon.json (python3 not available, used simple config)"
}
else
    # Create new daemon.json
    cat > "$DAEMON_CONFIG" << EOF
{
  "insecure-registries": [
    "$REGISTRY"
  ]
}
EOF
    echo "✅ Created new daemon.json"
fi

echo ""
echo "📄 Current daemon.json content:"
cat "$DAEMON_CONFIG"

echo ""
echo "🔄 Restarting Docker daemon..."
systemctl restart docker

if [ $? -eq 0 ]; then
    echo "✅ Docker daemon restarted successfully"
    
    echo ""
    echo "🧪 Testing Docker connection..."
    if docker version &> /dev/null; then
        echo "✅ Docker is running properly"
        
        echo ""
        echo "🧪 Testing registry connection..."
        if docker pull hello-world &> /dev/null && docker tag hello-world "$REGISTRY/hello-world:test" &> /dev/null; then
            if docker push "$REGISTRY/hello-world:test" &> /dev/null; then
                echo "✅ Registry connection successful!"
                docker rmi "$REGISTRY/hello-world:test" &> /dev/null
            else
                echo "❌ Failed to push to registry. Check if registry is running at $REGISTRY"
            fi
        else
            echo "⚠️  Could not test registry push (hello-world image issues)"
        fi
    else
        echo "❌ Docker is not responding after restart"
    fi
else
    echo "❌ Failed to restart Docker daemon"
    exit 1
fi

echo ""
echo "🎉 Configuration complete!"
echo "You can now build and push images to $REGISTRY"