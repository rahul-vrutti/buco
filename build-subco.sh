#!/bin/bash

# Build script for subco service on Linux
# Usage: ./build-subco.sh [version]

VERSION=${1:-"latest"}
REGISTRY="100.103.254.213:5001"
SERVICE_NAME="subco"
BUILD_DIR="../subco"

echo "🏗️  Building $SERVICE_NAME:$VERSION"
echo "📁 Build directory: $BUILD_DIR"
echo "🐳 Registry: $REGISTRY"
echo "🖥️  Platform: Linux"

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ Build directory not found: $BUILD_DIR"
    exit 1
fi

# Check if Dockerfile exists
if [ ! -f "$BUILD_DIR/Dockerfile" ]; then
    echo "❌ Dockerfile not found in: $BUILD_DIR/Dockerfile"
    exit 1
fi

# Navigate to build directory
cd "$BUILD_DIR"

# Build the image
echo "🔨 Building Docker image..."
if ! docker build -t "$SERVICE_NAME:$VERSION" -t "$SERVICE_NAME:latest" .; then
    echo "❌ Docker build failed"
    exit 1
fi

# Tag for registry
echo "🏷️  Tagging for registry..."
docker tag "$SERVICE_NAME:$VERSION" "$REGISTRY/$SERVICE_NAME:$VERSION"
docker tag "$SERVICE_NAME:$VERSION" "$REGISTRY/$SERVICE_NAME:latest"

# Push to registry
echo "🚀 Pushing to registry..."
if docker push "$REGISTRY/$SERVICE_NAME:$VERSION" && docker push "$REGISTRY/$SERVICE_NAME:latest"; then
    echo "✅ Successfully built and pushed $SERVICE_NAME:$VERSION"
    echo "📦 Available at:"
    echo "   - $REGISTRY/$SERVICE_NAME:$VERSION"
    echo "   - $REGISTRY/$SERVICE_NAME:latest"
else
    echo "❌ Failed to push to registry"
    echo "💡 Make sure Docker daemon is configured for insecure registry:"
    echo "   Add '$REGISTRY' to /etc/docker/daemon.json insecure-registries"
    exit 1
fi