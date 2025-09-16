#!/bin/bash

# Build Automation Script for Buco
# This script builds the frontend, backend, and creates the combined build directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo "🚀 Starting build process for Buco..."

# 1. Install dependencies if needed
echo "📦 Installing dependencies..."
cd "$PROJECT_ROOT"
npm install

cd "$PROJECT_ROOT/backend"
npm install

cd "$PROJECT_ROOT/frontend"
npm install

# 2. Build frontend
echo "🏗️ Building frontend..."
cd "$PROJECT_ROOT/frontend"
npm run build

# 3. Prepare build directory
echo "📁 Preparing build directory..."
cd "$PROJECT_ROOT"
rm -rf build/front
mkdir -p build/front

# 4. Copy frontend build to build directory
echo "📋 Copying frontend build..."
cp -r frontend/build/* build/front/

# 5. Copy backend files to build directory
echo "📋 Copying backend files..."
cp backend/server.js build/
cp backend/package.json build/

# 6. Install production dependencies in build directory
echo "📦 Installing production dependencies in build directory..."
cd build
npm ci --only=production

echo "✅ Build process completed successfully!"
echo "Build directory is ready at: $PROJECT_ROOT/build"