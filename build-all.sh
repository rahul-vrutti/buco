#!/bin/bash

# Build script for both buco and subco services on Linux
# Usage: ./build-all.sh [version]

VERSION=${1:-"latest"}
REGISTRY="100.103.254.213:5001"

echo "🏗️  Building both buco and subco services with version: $VERSION"
echo "🐳 Registry: $REGISTRY"
echo "🖥️  Platform: Linux"
echo ""

# Make scripts executable
chmod +x build-buco.sh
chmod +x build-subco.sh

# Build buco first
echo "========================================"
echo "🔨 Building BUCO service"
echo "========================================"
if ! ./build-buco.sh "$VERSION"; then
    echo "❌ Failed to build buco"
    BUCO_FAILED=true
else
    echo "✅ Buco build completed successfully"
    BUCO_FAILED=false
fi

echo ""
echo "========================================"
echo "🔨 Building SUBCO service"
echo "========================================"
if ! ./build-subco.sh "$VERSION"; then
    echo "❌ Failed to build subco"
    SUBCO_FAILED=true
else
    echo "✅ Subco build completed successfully"
    SUBCO_FAILED=false
fi

echo ""
echo "========================================"
echo "📊 Build Summary"
echo "========================================"

if [ "$BUCO_FAILED" = false ] && [ "$SUBCO_FAILED" = false ]; then
    echo "✅ Successfully built and pushed both services!"
    echo "📦 Available images:"
    echo "   - $REGISTRY/buco:$VERSION"
    echo "   - $REGISTRY/buco:latest"
    echo "   - $REGISTRY/subco:$VERSION"
    echo "   - $REGISTRY/subco:latest"
    
    echo ""
    echo "📋 To verify images were pushed successfully:"
    echo "   docker images $REGISTRY/*"
    exit 0
else
    echo "⚠️  Some builds failed:"
    [ "$BUCO_FAILED" = true ] && echo "   ❌ Buco build failed"
    [ "$SUBCO_FAILED" = true ] && echo "   ❌ Subco build failed"
    exit 1
fi