# LaunchList Deployment Guide

## Quick Start (Linux)

```bash
# Clone the repository
git clone https://github.com/yourrepo/LaunchList.git
cd LaunchList

# Create and edit configuration
cp LaunchList.env.example LaunchList.env
nano LaunchList.env    # Fill in all [REQUIRED] fields

# Run the installer
sudo ./deploy/install.sh
```

The installer will:
- Validate your configuration file
- Check and install Docker if needed
- Build and start the application
- Install nginx and obtain a Let's Encrypt SSL certificate for your domain
- Prompt you to create an admin account

## Manual Installation

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### Steps

1. **Clone and configure:**
   ```bash
   git clone https://github.com/yourrepo/LaunchList.git
   cd LaunchList
   cp LaunchList.env.example LaunchList.env
   ```

2. **Edit configuration:**
   ```bash
   nano LaunchList.env
   ```

   Required settings:
   - `JWT_SECRET` - Generate with: `openssl rand -hex 32`
   - `DOMAIN` - Your domain name (e.g., `LaunchList.blastoffgaming.com`)
   - Store branding (name, email, phone, address)
   - Optional: SMTP settings for email notifications

3. **Start the application:**
   ```bash
   docker compose --env-file LaunchList.env up -d --build
   ```

4. **Create admin user:**
   ```bash
   docker exec -it LaunchList sh
   ADMIN_PASSWORD=your-secure-password node dist/db/seed.js
   exit
   ```

5. **Access the application:**
   - Customer portal: https://yourdomain.com
   - Staff login: https://yourdomain.com/staff/login
   - Admin email: admin@store.com

## Configuration

All configuration is in a single `LaunchList.env` file. See `LaunchList.env.example` for all options.

### Key Settings

| Setting | Description | Required |
|---------|-------------|----------|
| `JWT_SECRET` | Secret key for auth tokens (min 32 chars) | Yes |
| `DOMAIN` | Your domain name for HTTPS | Yes |
| `STORE_NAME` | Your store name | Yes |
| `SMTP_HOST` | Email server for notifications | No |

### Email Setup (Gmail)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youremail@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=youremail@gmail.com
```

Generate an app password at: https://myaccount.google.com/apppasswords

## Production Deployment

### SSL & Nginx (Automated)

The installer automatically handles SSL setup:

1. Installs nginx and certbot if not already present
2. Obtains a Let's Encrypt certificate for the `DOMAIN` in your config
3. Deploys the nginx reverse proxy with SSL termination
4. Sets up automatic certificate renewal via cron/systemd

**Prerequisites:**
- Your server must be reachable at the configured `DOMAIN` on ports 80 and 443
- DNS must already point to your server's IP address

The `CORS_ORIGIN` is auto-set to `https://$DOMAIN` if left empty.

### Manual SSL Setup

If you prefer to manage SSL yourself (without the automated installer), set up nginx manually:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/LaunchList
sudo ln -s /etc/nginx/sites-available/LaunchList /etc/nginx/sites-enabled/
# Edit server_name in the config, then:
sudo certbot --nginx -d yourdomain.com
sudo systemctl restart nginx
```

## Management Commands

```bash
# View logs
docker compose --env-file LaunchList.env logs -f

# Restart
docker compose --env-file LaunchList.env restart

# Stop
docker compose --env-file LaunchList.env down

# Update
git pull
docker compose --env-file LaunchList.env up -d --build

# Backup database
docker cp LaunchList:/app/data/LaunchList.db ./backup-$(date +%Y%m%d).db

# Shell access
docker exec -it LaunchList sh
```

## Uninstall

```bash
sudo ./deploy/uninstall.sh
```

## Troubleshooting

### Application won't start

Check logs:
```bash
docker compose logs
```

### Can't connect

Ensure ports 80 and 443 are open:
```bash
sudo ufw allow 80
sudo ufw allow 443
```

Verify nginx is running:
```bash
sudo systemctl status nginx
```

### Reset admin password

```bash
docker exec -it LaunchList sh
# Delete old admin and recreate
sqlite3 /app/data/LaunchList.db "DELETE FROM users WHERE email='admin@store.com';"
ADMIN_PASSWORD=new-password node dist/db/seed.js
```

## Files

- `LaunchList.env` - All configuration (create from LaunchList.env.example)
- `deploy/install.sh` - Installation script
- `deploy/uninstall.sh` - Uninstallation script
- `deploy/nginx.conf` - Nginx reverse proxy config
- `docker-compose.yml` - Docker orchestration
