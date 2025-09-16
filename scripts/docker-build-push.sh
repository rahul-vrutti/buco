#!/bin/bash

# Docker Build and Push Script for Buco and Subco
# This script builds Docker images with version tags and pushes them to the local registry

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
REGISTRY="100.103.254.213:5001"

# Function to print colored output
print_info() {
    echo -e "\033[1;34m$1\033[0m"
}

print_success() {
    echo -e "\033[1;32m$1\033[0m"
}

print_error() {
    echo -e "\033[1;31m$1\033[0m"
}

# Function to build and push Docker image
build_and_push_image() {
    local SERVICE_NAME=$1
    local SERVICE_PATH=$2
    local VERSION=$3
    
    print_info "🏗️ Building Docker image for $SERVICE_NAME:$VERSION..."
    
    cd "$PROJECT_ROOT/$SERVICE_PATH"
    
    # Build with version tag
    docker build -t "${REGISTRY}/${SERVICE_NAME}:${VERSION}" .
    
    # Also tag as latest
    docker tag "${REGISTRY}/${SERVICE_NAME}:${VERSION}" "${REGISTRY}/${SERVICE_NAME}:latest"
    
    print_info "📤 Pushing $SERVICE_NAME:$VERSION to registry..."
    
    # Push version tag
    docker push "${REGISTRY}/${SERVICE_NAME}:${VERSION}"
    
    # Push latest tag
    docker push "${REGISTRY}/${SERVICE_NAME}:latest"
    
    print_success "✅ Successfully built and pushed $SERVICE_NAME:$VERSION"
}

# Default versions (will be overridden by command line arguments)
BUCO_VERSION="1.0.0"
SUBCO_VERSION="1.0.0"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --buco-version)
            BUCO_VERSION="$2"
            shift 2
            ;;
        --subco-version)
            SUBCO_VERSION="$2"
            shift 2
            ;;
        --version-file)
            VERSION_FILE="$2"
            shift 2
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Usage: $0 [--buco-version VERSION] [--subco-version VERSION] [--version-file FILE]"
            exit 1
            ;;
    esac
done

# If version file is provided, parse versions from it
if [[ -n "$VERSION_FILE" && -f "$VERSION_FILE" ]]; then
    print_info "📄 Reading versions from file: $VERSION_FILE"
    
    while IFS= read -r line; do
        line=$(echo "$line" | xargs)  # Trim whitespace
        if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
            if [[ "$line" =~ ^buco[[:space:]]*[=:][[:space:]]*(.+)$ ]]; then
                BUCO_VERSION="${BASH_REMATCH[1]}"
                print_info "Found buco version: $BUCO_VERSION"
            elif [[ "$line" =~ ^subco[[:space:]]*[=:][[:space:]]*(.+)$ ]]; then
                SUBCO_VERSION="${BASH_REMATCH[1]}"
                print_info "Found subco version: $SUBCO_VERSION"
            fi
        fi
    done < "$VERSION_FILE"
fi

print_info "🚀 Starting Docker build and push process..."
print_info "Buco version: $BUCO_VERSION"
print_info "Subco version: $SUBCO_VERSION"
print_info "Registry: $REGISTRY"

# Check if registry is accessible
print_info "🔍 Checking registry connectivity..."
if ! curl -s -f "http://$REGISTRY/v2/" > /dev/null; then
    print_error "❌ Cannot connect to registry at $REGISTRY"
    print_error "Please ensure the registry is running and accessible"
    exit 1
fi
print_success "✅ Registry is accessible"

# Build frontend and backend first
print_info "🏗️ Building buco frontend and backend..."
cd "$PROJECT_ROOT"
chmod +x scripts/build.sh
./scripts/build.sh

# Build and push buco image
build_and_push_image "buco" "build" "$BUCO_VERSION"

# Build and push subco image
build_and_push_image "subco" "../subco" "$SUBCO_VERSION"

print_success "🎉 All Docker images built and pushed successfully!"
print_success "Images pushed:"
print_success "  - ${REGISTRY}/buco:${BUCO_VERSION}"
print_success "  - ${REGISTRY}/buco:latest"
print_success "  - ${REGISTRY}/subco:${SUBCO_VERSION}"
print_success "  - ${REGISTRY}/subco:latest"