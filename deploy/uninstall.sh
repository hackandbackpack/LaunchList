#!/bin/bash
#
# LaunchList Uninstall Script
#
# Usage: sudo ./uninstall.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/LaunchList"
DATA_DIR="/var/lib/LaunchList"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Please run as root or with sudo"
    exit 1
fi

echo -e "${YELLOW}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  LaunchList Uninstaller                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo -e "${RED}WARNING: This will remove LaunchList and optionally all data.${NC}"
echo ""

read -p "Continue with uninstall? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

# Stop containers
if [ -d "$APP_DIR" ]; then
    log_info "Stopping LaunchList containers..."
    cd "$APP_DIR"
    docker compose down 2>/dev/null || docker-compose down 2>/dev/null || true
fi

# Remove Docker volume
log_info "Removing Docker volume..."
docker volume rm LaunchList-data 2>/dev/null || true

# Ask about data
echo ""
read -p "Remove database and uploaded files? (y/N): " remove_data
if [[ "$remove_data" =~ ^[Yy]$ ]]; then
    log_info "Removing data directory..."
    rm -rf "$DATA_DIR"
    log_success "Data removed"
else
    log_info "Data preserved at $DATA_DIR"
fi

# Remove application files
log_info "Removing application files..."
rm -rf "$APP_DIR"

# Remove systemd service if exists
if [ -f /etc/systemd/system/LaunchList.service ]; then
    log_info "Removing systemd service..."
    systemctl stop LaunchList 2>/dev/null || true
    systemctl disable LaunchList 2>/dev/null || true
    rm -f /etc/systemd/system/LaunchList.service
    systemctl daemon-reload
fi

echo ""
log_success "LaunchList has been uninstalled"
echo ""
echo "Note: Docker and Docker Compose were not removed."
echo "To remove them, use your package manager."
