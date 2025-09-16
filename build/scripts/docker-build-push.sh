#!/bin/bash

# Docker Build and Push Script for Buco and Subco (Container Version)
# This script builds Docker images with version tags and pushes them to the local registry

set -e

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
    local VERSION=$2
    local BUILD_CONTEXT=$3
    
    print_info "🏗️ Building Docker image for $SERVICE_NAME:$VERSION..."
    
    if [[ "$SERVICE_NAME" == "buco" ]]; then
        # For buco, we're running inside the container, so we'll tag the current running image
        # First, find the current running container ID
        CURRENT_CONTAINER_ID=$(hostname)
        
        # Commit the current container as a new image
        docker commit "$CURRENT_CONTAINER_ID" "${REGISTRY}/${SERVICE_NAME}:${VERSION}"
        
        # Also tag as latest
        docker tag "${REGISTRY}/${SERVICE_NAME}:${VERSION}" "${REGISTRY}/${SERVICE_NAME}:latest"
    else
        # For other services, try to build from context if Dockerfile exists
        if [[ -f "$BUILD_CONTEXT/Dockerfile" ]]; then
            docker build -t "${REGISTRY}/${SERVICE_NAME}:${VERSION}" "$BUILD_CONTEXT"
            docker tag "${REGISTRY}/${SERVICE_NAME}:${VERSION}" "${REGISTRY}/${SERVICE_NAME}:latest"
        else
            print_error "❌ Dockerfile not found at $BUILD_CONTEXT/Dockerfile"
            return 1
        fi
    fi
    
    print_info "📤 Pushing $SERVICE_NAME:$VERSION to registry..."
    
    # Push version tag
    docker push "${REGISTRY}/${SERVICE_NAME}:${VERSION}"
    
    # Push latest tag
    docker push "${REGISTRY}/${SERVICE_NAME}:latest"
    
    print_success "✅ Successfully built and pushed $SERVICE_NAME:$VERSION"
}

# Default versions
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

# Build and push buco image using current directory (we're already inside the buco container)
print_info "🏗️ Building buco image from current build context..."
build_and_push_image "buco" "$BUCO_VERSION" "/app"

# Build and push subco image if the directory is available
if [[ -d "/host/subco" ]]; then
    print_info "🏗️ Building subco image from mounted directory..."
    build_and_push_image "subco" "$SUBCO_VERSION" "/host/subco"
else
    print_error "⚠️ Subco directory not available at /host/subco"
    print_error "To build subco, mount the subco directory to /host/subco when running the container"
fi

print_success "🎉 Docker build and push process completed!"
print_success "Images pushed:"
print_success "  - ${REGISTRY}/buco:${BUCO_VERSION}"
print_success "  - ${REGISTRY}/buco:latest"
if [[ -d "/host/subco" ]]; then
    print_success "  - ${REGISTRY}/subco:${SUBCO_VERSION}"
    print_success "  - ${REGISTRY}/subco:latest"
else
    print_info "  (subco image skipped - directory not mounted)"
fi
