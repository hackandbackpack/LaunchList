#!/bin/bash
#
# ListPull Installation Script for Linux
# Supports: Ubuntu/Debian, RHEL/CentOS/Fedora, Arch Linux
#
# Prerequisites:
#   1. Copy listpull.env.example to listpull.env
#   2. Fill in all required fields in listpull.env
#   3. Run: sudo ./deploy/install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="listpull"
APP_DIR="/opt/listpull"
DATA_DIR="/var/lib/listpull"
REQUIRED_DOCKER_VERSION="20.10.0"
REQUIRED_COMPOSE_VERSION="2.0.0"

# Required configuration fields
REQUIRED_FIELDS=(
    "JWT_SECRET"
    "STORE_NAME"
    "STORE_EMAIL"
    "STORE_PHONE"
    "STORE_ADDRESS"
    "DOMAIN"
)

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_banner() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    ListPull Installer                        ║"
    echo "║              Self-Hosted Decklist Manager                    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root or with sudo"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        DISTRO_VERSION=$VERSION_ID
    elif [ -f /etc/redhat-release ]; then
        DISTRO="rhel"
    elif [ -f /etc/debian_version ]; then
        DISTRO="debian"
    else
        DISTRO="unknown"
    fi
    log_info "Detected distribution: $DISTRO $DISTRO_VERSION"
}

# Version comparison function
version_gte() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# Find the source directory (handles running from deploy/ subdirectory)
find_source_dir() {
    local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [ -f "./docker-compose.yml" ]; then
        SOURCE_DIR="$(pwd)"
    elif [ -f "../docker-compose.yml" ]; then
        SOURCE_DIR="$(cd .. && pwd)"
    elif [ -f "$SCRIPT_DIR/../docker-compose.yml" ]; then
        SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    else
        log_error "Could not find ListPull source files"
        log_info "Please run this script from the ListPull directory:"
        log_info "  cd /path/to/listpull"
        log_info "  sudo ./deploy/install.sh"
        exit 1
    fi

    CONFIG_FILE="$SOURCE_DIR/listpull.env"
}

# Validate configuration file
validate_config() {
    log_info "Validating configuration file..."

    # Check if config file exists
    if [ ! -f "$CONFIG_FILE" ]; then
        echo ""
        log_error "Configuration file not found: $CONFIG_FILE"
        echo ""
        echo -e "${YELLOW}Please complete these steps before running the installer:${NC}"
        echo ""
        echo "  1. Copy the example configuration:"
        echo -e "     ${BLUE}cp listpull.env.example listpull.env${NC}"
        echo ""
        echo "  2. Edit the configuration file:"
        echo -e "     ${BLUE}nano listpull.env${NC}"
        echo ""
        echo "  3. Fill in all [REQUIRED] fields (see comments in file)"
        echo ""
        echo "  4. Run this installer again:"
        echo -e "     ${BLUE}sudo ./deploy/install.sh${NC}"
        echo ""
        exit 1
    fi

    # Load config file
    set -a
    source "$CONFIG_FILE"
    set +a

    # Check required fields
    local missing_fields=()
    local invalid_fields=()

    for field in "${REQUIRED_FIELDS[@]}"; do
        value="${!field}"
        if [ -z "$value" ]; then
            missing_fields+=("$field")
        fi
    done

    # Validate JWT_SECRET length
    if [ -n "$JWT_SECRET" ] && [ ${#JWT_SECRET} -lt 32 ]; then
        invalid_fields+=("JWT_SECRET (must be at least 32 characters)")
    fi

    # Validate phone format (should be XXX.XXX.XXXX or similar)
    if [ -n "$STORE_PHONE" ]; then
        # Remove all non-digits and check length
        phone_digits=$(echo "$STORE_PHONE" | tr -cd '0-9')
        if [ ${#phone_digits} -ne 10 ]; then
            invalid_fields+=("STORE_PHONE (should be 10 digits, e.g., 555.123.4567)")
        fi
    fi

    # Validate email format
    if [ -n "$STORE_EMAIL" ]; then
        if ! echo "$STORE_EMAIL" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
            invalid_fields+=("STORE_EMAIL (invalid email format)")
        fi
    fi

    # Validate DOMAIN format (no protocol, no trailing slash, looks like a hostname)
    if [ -n "$DOMAIN" ]; then
        if echo "$DOMAIN" | grep -qE '^https?://'; then
            invalid_fields+=("DOMAIN (remove http:// or https:// — just the hostname)")
        elif echo "$DOMAIN" | grep -qE '/$'; then
            invalid_fields+=("DOMAIN (remove trailing slash)")
        elif ! echo "$DOMAIN" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$'; then
            invalid_fields+=("DOMAIN (invalid domain format, e.g., listpull.example.com)")
        fi
    fi

    # Report errors
    if [ ${#missing_fields[@]} -gt 0 ] || [ ${#invalid_fields[@]} -gt 0 ]; then
        echo ""
        log_error "Configuration validation failed!"
        echo ""

        if [ ${#missing_fields[@]} -gt 0 ]; then
            echo -e "${RED}Missing required fields:${NC}"
            for field in "${missing_fields[@]}"; do
                echo "  - $field"
            done
            echo ""
        fi

        if [ ${#invalid_fields[@]} -gt 0 ]; then
            echo -e "${RED}Invalid fields:${NC}"
            for field in "${invalid_fields[@]}"; do
                echo "  - $field"
            done
            echo ""
        fi

        echo -e "${YELLOW}Please edit your configuration file:${NC}"
        echo -e "  ${BLUE}nano $CONFIG_FILE${NC}"
        echo ""
        echo "Then run the installer again."
        echo ""
        exit 1
    fi

    log_success "Configuration validated successfully"

    # Show summary
    echo ""
    echo -e "${BLUE}Store Configuration:${NC}"
    echo "  Name:    $STORE_NAME"
    echo "  Email:   $STORE_EMAIL"
    echo "  Phone:   $STORE_PHONE"
    echo "  Address: $STORE_ADDRESS"
    echo "  Domain:  $DOMAIN"
    if [ -n "$SMTP_HOST" ]; then
        echo "  Notifications: Enabled (SMTP: $SMTP_HOST)"
    else
        echo "  Notifications: Disabled (no SMTP configured)"
    fi
    echo ""
}

# Auto-set CORS_ORIGIN from DOMAIN if not already configured
configure_cors_origin() {
    if [ -z "$CORS_ORIGIN" ] && [ -n "$DOMAIN" ]; then
        log_info "Setting CORS_ORIGIN to https://$DOMAIN..."
        CORS_ORIGIN="https://$DOMAIN"
        # Update the env file so the running container picks it up
        if grep -q '^CORS_ORIGIN=' "$CONFIG_FILE"; then
            sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" "$CONFIG_FILE"
        else
            echo "CORS_ORIGIN=https://$DOMAIN" >> "$CONFIG_FILE"
        fi
        log_success "CORS_ORIGIN set to https://$DOMAIN"
    fi
}

# Install nginx if not present
install_nginx() {
    if command -v nginx &> /dev/null; then
        log_success "Nginx already installed"
        return 0
    fi

    log_info "Installing nginx..."

    case "$DISTRO" in
        ubuntu|debian)
            apt-get update
            apt-get install -y nginx
            ;;
        centos|rhel|rocky|almalinux)
            yum install -y epel-release
            yum install -y nginx
            ;;
        fedora)
            dnf install -y nginx
            ;;
        arch|manjaro)
            pacman -Sy --noconfirm nginx
            ;;
        *)
            log_error "Unsupported distribution for nginx: $DISTRO"
            log_info "Please install nginx manually and re-run the installer."
            exit 1
            ;;
    esac

    systemctl start nginx
    systemctl enable nginx

    log_success "Nginx installed successfully"
}

# Install certbot and nginx plugin
install_certbot() {
    if command -v certbot &> /dev/null; then
        log_success "Certbot already installed"
        return 0
    fi

    log_info "Installing certbot..."

    case "$DISTRO" in
        ubuntu|debian)
            apt-get update
            apt-get install -y certbot python3-certbot-nginx
            ;;
        centos|rhel|rocky|almalinux)
            yum install -y epel-release
            yum install -y certbot python3-certbot-nginx
            ;;
        fedora)
            dnf install -y certbot python3-certbot-nginx
            ;;
        arch|manjaro)
            pacman -Sy --noconfirm certbot certbot-nginx
            ;;
        *)
            log_error "Unsupported distribution for certbot: $DISTRO"
            log_info "Please install certbot manually and re-run the installer."
            exit 1
            ;;
    esac

    log_success "Certbot installed successfully"
}

# Determine the nginx config directory for this distro
get_nginx_config_paths() {
    if [ -d /etc/nginx/sites-available ]; then
        # Debian/Ubuntu style
        NGINX_CONF_DIR="/etc/nginx/sites-available"
        NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
        NGINX_LINK_STYLE="symlink"
    else
        # RHEL/Arch style
        NGINX_CONF_DIR="/etc/nginx/conf.d"
        NGINX_ENABLED_DIR=""
        NGINX_LINK_STYLE="direct"
    fi
}

# Set up SSL certificates and nginx reverse proxy
setup_ssl() {
    log_info "Setting up SSL and nginx reverse proxy for $DOMAIN..."

    get_nginx_config_paths
    mkdir -p /var/www/certbot

    local SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local TEMPLATE="$SOURCE_DIR/deploy/nginx.conf"

    if [ ! -f "$TEMPLATE" ]; then
        log_error "Nginx config template not found at $TEMPLATE"
        exit 1
    fi

    # --- Phase 1: Deploy HTTP-only config for ACME challenge ---
    log_info "Deploying temporary HTTP config for certificate verification..."

    local TEMP_CONF
    if [ "$NGINX_LINK_STYLE" = "symlink" ]; then
        TEMP_CONF="$NGINX_CONF_DIR/listpull"
    else
        TEMP_CONF="$NGINX_CONF_DIR/listpull.conf"
    fi

    # Write a minimal HTTP-only config for the ACME challenge
    cat > "$TEMP_CONF" <<NGINX_HTTP
# Temporary HTTP-only config for Let's Encrypt verification
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 503;
    }
}
NGINX_HTTP

    # Enable the site (Debian/Ubuntu symlink style)
    if [ "$NGINX_LINK_STYLE" = "symlink" ]; then
        ln -sf "$TEMP_CONF" "$NGINX_ENABLED_DIR/listpull"
        # Remove default site if it would conflict on port 80
        rm -f "$NGINX_ENABLED_DIR/default"
    fi

    nginx -t || {
        log_error "Nginx configuration test failed"
        exit 1
    }
    systemctl reload nginx

    # --- Phase 2: Obtain SSL certificate ---
    log_info "Requesting SSL certificate from Let's Encrypt..."

    certbot certonly \
        --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        -m "$STORE_EMAIL" || {
        log_error "Failed to obtain SSL certificate"
        log_info "Ensure your server is reachable at $DOMAIN on port 80"
        log_info "Check DNS records and firewall rules, then re-run the installer."
        exit 1
    }

    log_success "SSL certificate obtained for $DOMAIN"

    # --- Phase 3: Deploy full SSL config ---
    log_info "Deploying full nginx SSL configuration..."

    cp "$TEMPLATE" "$TEMP_CONF"
    sed -i "s/listpull\.yourdomain\.com/$DOMAIN/g" "$TEMP_CONF"

    # Enable the site (already symlinked for Debian/Ubuntu)
    nginx -t || {
        log_error "Full nginx configuration test failed"
        exit 1
    }
    systemctl reload nginx

    log_success "Nginx reverse proxy configured with SSL"

    # --- Phase 4: Set up auto-renewal ---
    setup_certbot_renewal

    log_success "SSL setup complete — https://$DOMAIN is ready"
}

# Configure certbot auto-renewal
setup_certbot_renewal() {
    log_info "Setting up automatic certificate renewal..."

    # Certbot usually installs a systemd timer or cron job automatically.
    # Verify it exists; if not, create one.
    if systemctl list-timers | grep -q certbot; then
        log_success "Certbot renewal timer already active"
        return 0
    fi

    if [ -f /etc/cron.d/certbot ]; then
        log_success "Certbot renewal cron already configured"
        return 0
    fi

    # Create a cron job as fallback
    echo '0 3 * * * root certbot renew --quiet --deploy-hook "systemctl reload nginx"' \
        > /etc/cron.d/listpull-certbot-renew
    chmod 644 /etc/cron.d/listpull-certbot-renew

    log_success "Certbot renewal cron job created"
}

# Check if Docker is installed and meets version requirements
check_docker() {
    log_info "Checking Docker installation..."

    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found"
        return 1
    fi

    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if version_gte "$DOCKER_VERSION" "$REQUIRED_DOCKER_VERSION"; then
        log_success "Docker $DOCKER_VERSION installed"
        return 0
    else
        log_warn "Docker $DOCKER_VERSION is below required version $REQUIRED_DOCKER_VERSION"
        return 1
    fi
}

# Check if Docker Compose is installed
check_docker_compose() {
    log_info "Checking Docker Compose installation..."

    if docker compose version &> /dev/null; then
        COMPOSE_VERSION=$(docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if version_gte "$COMPOSE_VERSION" "$REQUIRED_COMPOSE_VERSION"; then
            log_success "Docker Compose $COMPOSE_VERSION installed"
            COMPOSE_CMD="docker compose"
            return 0
        fi
    fi

    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        log_success "Docker Compose $COMPOSE_VERSION installed (legacy)"
        COMPOSE_CMD="docker-compose"
        return 0
    fi

    log_warn "Docker Compose not found"
    return 1
}

# Install Docker based on distribution
install_docker() {
    log_info "Installing Docker..."

    case "$DISTRO" in
        ubuntu|debian)
            apt-get update
            apt-get install -y ca-certificates curl gnupg
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$DISTRO/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$DISTRO \
                $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
                tee /etc/apt/sources.list.d/docker.list > /dev/null
            apt-get update
            apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel|fedora|rocky|almalinux)
            if [ "$DISTRO" = "fedora" ]; then
                dnf -y install dnf-plugins-core
                dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
                dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            else
                yum install -y yum-utils
                yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            fi
            ;;
        arch|manjaro)
            pacman -Sy --noconfirm docker docker-compose
            ;;
        *)
            log_error "Unsupported distribution: $DISTRO"
            log_info "Please install Docker manually: https://docs.docker.com/engine/install/"
            exit 1
            ;;
    esac

    systemctl start docker
    systemctl enable docker

    log_success "Docker installed successfully"
}

# Check for required utilities
check_utilities() {
    log_info "Checking required utilities..."

    local missing=()

    for util in curl git; do
        if ! command -v $util &> /dev/null; then
            missing+=($util)
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_info "Installing missing utilities: ${missing[*]}"
        case "$DISTRO" in
            ubuntu|debian)
                apt-get update
                apt-get install -y "${missing[@]}"
                ;;
            centos|rhel|fedora|rocky|almalinux)
                yum install -y "${missing[@]}" || dnf install -y "${missing[@]}"
                ;;
            arch|manjaro)
                pacman -Sy --noconfirm "${missing[@]}"
                ;;
        esac
    fi

    log_success "All required utilities available"
}

# Setup application directory
setup_application() {
    log_info "Setting up application..."

    mkdir -p "$DATA_DIR"
    chmod 755 "$DATA_DIR"

    if [ -d "$APP_DIR" ]; then
        log_info "Application directory exists, updating..."
        cd "$APP_DIR"
        if [ -d ".git" ]; then
            git pull origin main || git pull origin master || true
        fi
    else
        log_info "Copying application files..."
        mkdir -p "$APP_DIR"
        cp -r "$SOURCE_DIR/." "$APP_DIR/"
    fi

    # Copy config file to app directory
    cp "$CONFIG_FILE" "$APP_DIR/listpull.env"

    cd "$APP_DIR"
    log_success "Application files ready at $APP_DIR"
}

# Build and start the application
start_application() {
    log_info "Building and starting ListPull..."

    cd "$APP_DIR"

    # Build and start with env file
    $COMPOSE_CMD --env-file listpull.env down 2>/dev/null || true
    $COMPOSE_CMD --env-file listpull.env up -d --build

    log_info "Waiting for application to start..."
    sleep 5

    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            log_success "Application is running!"
            return 0
        fi
        sleep 2
    done

    log_warn "Application may still be starting. Check status with: $COMPOSE_CMD --env-file listpull.env logs"
}

# Create initial admin user
create_admin_user() {
    echo ""
    echo -e "${BLUE}=== Create Admin User ===${NC}"
    echo "You need an admin account to access the staff dashboard."
    echo ""

    while true; do
        read -sp "Enter admin password (min 12 characters): " ADMIN_PASSWORD
        echo ""

        if [ ${#ADMIN_PASSWORD} -lt 12 ]; then
            log_warn "Password must be at least 12 characters"
            continue
        fi

        read -sp "Confirm admin password: " ADMIN_PASSWORD_CONFIRM
        echo ""

        if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
            log_warn "Passwords do not match"
            continue
        fi

        break
    done

    log_info "Creating admin user..."
    cd "$APP_DIR"

    docker exec listpull sh -c "ADMIN_PASSWORD='$ADMIN_PASSWORD' node dist/db/seed.js" 2>/dev/null && {
        log_success "Admin user created"
        echo "  Email: admin@store.com"
    } || {
        log_warn "Could not create admin user automatically"
        log_info "Create admin manually by running:"
        log_info "  docker exec -it listpull sh"
        log_info "  ADMIN_PASSWORD=your-password node dist/db/seed.js"
    }
}

# Print final instructions
print_success() {
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              ListPull Installation Complete!                 ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Application URL:${NC} https://$DOMAIN"
    echo -e "${BLUE}Staff Login:${NC}    https://$DOMAIN/staff/login"
    echo -e "${BLUE}Admin Email:${NC}    admin@store.com"
    echo ""
    echo -e "${BLUE}Configuration:${NC}  $APP_DIR/listpull.env"
    echo -e "${BLUE}Data Directory:${NC} $DATA_DIR"
    echo -e "${BLUE}SSL Certs:${NC}      /etc/letsencrypt/live/$DOMAIN/"
    echo ""
    echo -e "${YELLOW}Useful Commands:${NC}"
    echo "  View logs:      cd $APP_DIR && docker compose --env-file listpull.env logs -f"
    echo "  Restart:        cd $APP_DIR && docker compose --env-file listpull.env restart"
    echo "  Stop:           cd $APP_DIR && docker compose --env-file listpull.env down"
    echo "  Update:         cd $APP_DIR && git pull && docker compose --env-file listpull.env up -d --build"
    echo "  Renew SSL:      certbot renew --quiet"
    echo ""
    echo -e "${YELLOW}SSL & Nginx:${NC}"
    echo "  Certificates auto-renew via cron/systemd timer."
    echo "  Nginx config: /etc/nginx/sites-available/listpull (or /etc/nginx/conf.d/listpull.conf)"
    echo ""
}

# Main installation flow
main() {
    print_banner
    check_root
    detect_distro

    echo ""
    log_info "Starting installation..."
    echo ""

    # Find source directory and config file
    find_source_dir

    # Validate configuration FIRST
    validate_config

    # Auto-set CORS_ORIGIN from DOMAIN
    configure_cors_origin

    # Check and install dependencies
    check_utilities

    if ! check_docker; then
        read -p "Install Docker? (Y/n): " install_docker_choice
        if [[ ! "$install_docker_choice" =~ ^[Nn]$ ]]; then
            install_docker
        else
            log_error "Docker is required. Please install it manually."
            exit 1
        fi
    fi

    if ! check_docker_compose; then
        log_error "Docker Compose is required. It should be included with Docker."
        log_info "Try reinstalling Docker or install docker-compose-plugin"
        exit 1
    fi

    log_success "All dependencies satisfied!"
    echo ""

    # Setup and start
    read -p "Continue with installation? (Y/n): " continue_choice
    if [[ "$continue_choice" =~ ^[Nn]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi

    setup_application
    start_application

    # Set up nginx reverse proxy and SSL
    install_nginx
    install_certbot
    setup_ssl

    # Create admin user
    read -p "Create admin user now? (Y/n): " admin_choice
    if [[ ! "$admin_choice" =~ ^[Nn]$ ]]; then
        create_admin_user
    fi

    print_success
}

# Run main function
main "$@"
