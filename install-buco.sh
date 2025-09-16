#!/bin/bash

# Buco Installation Script for Linux
# Usage: sudo ./install-buco.sh

set -e

INSTALL_DIR="/opt/buco"
SERVICE_USER="buco"
SERVICE_GROUP="buco"
UPLOADS_DIR="/opt/buco/uploads"
LOG_DIR="/var/log/buco"

echo "🚀 Installing Buco Package Management System"
echo "📁 Installation directory: $INSTALL_DIR"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Create service user and group
echo "👤 Creating service user and group..."
if ! getent group "$SERVICE_GROUP" > /dev/null; then
    groupadd --system "$SERVICE_GROUP"
fi

if ! getent passwd "$SERVICE_USER" > /dev/null; then
    useradd --system --gid "$SERVICE_GROUP" --home-dir "$INSTALL_DIR" \
            --shell /bin/false --comment "Buco service user" "$SERVICE_USER"
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p "$INSTALL_DIR"/{backend,build,uploads}
mkdir -p "$LOG_DIR"

# Copy application files
echo "📦 Copying application files..."
cp -r backend/* "$INSTALL_DIR/backend/"
cp -r build/* "$INSTALL_DIR/build/"
cp *.sh "$INSTALL_DIR/"

# Make scripts executable
chmod +x "$INSTALL_DIR"/*.sh

# Set ownership
echo "🔒 Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
cd "$INSTALL_DIR/backend"
sudo -u "$SERVICE_USER" npm install --production

# Install systemd service
echo "⚙️  Installing systemd service..."
cp buco-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable buco-backend

# Configure Docker for insecure registry
echo "🐳 Configuring Docker..."
if [ -f ./configure-docker-registry.sh ]; then
    ./configure-docker-registry.sh
fi

# Create log rotation config
echo "📝 Setting up log rotation..."
cat > /etc/logrotate.d/buco << 'EOF'
/var/log/buco/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 buco buco
    postrotate
        systemctl reload buco-backend > /dev/null 2>&1 || true
    endscript
}
EOF

echo ""
echo "✅ Installation completed successfully!"
echo ""
echo "🚀 To start the service:"
echo "   sudo systemctl start buco-backend"
echo ""
echo "📊 To check status:"
echo "   sudo systemctl status buco-backend"
echo ""
echo "📝 To view logs:"
echo "   sudo journalctl -u buco-backend -f"
echo ""
echo "🌐 Web interface will be available at:"
echo "   http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "🔧 Configuration files:"
echo "   Service: /etc/systemd/system/buco-backend.service"
echo "   Application: $INSTALL_DIR"
echo "   Logs: $LOG_DIR"
echo ""
echo "💡 Next steps:"
echo "   1. sudo systemctl start buco-backend"
echo "   2. Upload a version file to trigger Docker builds"
echo "   3. Check registry at http://100.103.254.213:5001/v2/_catalog"