#!/bin/bash

# Build script for buco service
# Usage: ./build-buco.sh [version]

VERSION=${1:-"latest"}
REGISTRY="100.103.254.213:5001"
SERVICE_NAME="buco"
BUILD_DIR="./build"

echo "🏗️  Building $SERVICE_NAME:$VERSION"
echo "📁 Build directory: $BUILD_DIR"
echo "🐳 Registry: $REGISTRY"

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

# Build the image
echo "🔨 Building Docker image..."
cd "$BUILD_DIR"
docker build -t "$SERVICE_NAME:$VERSION" -t "$SERVICE_NAME:latest" .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

# Tag for registry
echo "🏷️  Tagging for registry..."
docker tag "$SERVICE_NAME:$VERSION" "$REGISTRY/$SERVICE_NAME:$VERSION"
docker tag "$SERVICE_NAME:$VERSION" "$REGISTRY/$SERVICE_NAME:latest"

# Push to registry
echo "🚀 Pushing to registry..."
docker push "$REGISTRY/$SERVICE_NAME:$VERSION"
docker push "$REGISTRY/$SERVICE_NAME:latest"

if [ $? -eq 0 ]; then
    echo "✅ Successfully built and pushed $SERVICE_NAME:$VERSION"
    echo "📦 Available at:"
    echo "   - $REGISTRY/$SERVICE_NAME:$VERSION"
    echo "   - $REGISTRY/$SERVICE_NAME:latest"
else
    echo "❌ Failed to push to registry"
    exit 1
fi