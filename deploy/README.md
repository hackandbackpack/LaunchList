# ListPull Deployment Guide

## Quick Start (Linux)

```bash
# Clone the repository
git clone https://github.com/yourrepo/listpull.git
cd listpull

# Run the installer (installs Docker if needed, guides you through setup)
sudo ./deploy/install.sh
```

That's it! The installer will:
- Check and install Docker if needed
- Guide you through configuration
- Start the application
- Create your admin account

## Manual Installation

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### Steps

1. **Clone and configure:**
   ```bash
   git clone https://github.com/yourrepo/listpull.git
   cd listpull
   cp .env.example listpull.env
   ```

2. **Edit configuration:**
   ```bash
   nano listpull.env
   ```

   Required settings:
   - `JWT_SECRET` - Generate with: `openssl rand -hex 32`
   - Store branding (name, email, phone, address)
   - Optional: SMTP settings for email notifications

3. **Start the application:**
   ```bash
   docker compose --env-file listpull.env up -d --build
   ```

4. **Create admin user:**
   ```bash
   docker exec -it listpull sh
   ADMIN_PASSWORD=your-secure-password node dist/db/seed.js
   exit
   ```

5. **Access the application:**
   - Customer portal: http://localhost:3000
   - Staff login: http://localhost:3000/staff/login
   - Admin email: admin@store.com

## Configuration

All configuration is in a single `listpull.env` file. See `.env.example` for all options.

### Key Settings

| Setting | Description | Required |
|---------|-------------|----------|
| `JWT_SECRET` | Secret key for auth tokens (min 32 chars) | Yes |
| `VITE_STORE_NAME` | Your store name | Yes |
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

### With Nginx Reverse Proxy

1. Copy nginx config:
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/listpull
   sudo ln -s /etc/nginx/sites-available/listpull /etc/nginx/sites-enabled/
   ```

2. Update server_name in the config to your domain

3. Get SSL certificate:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

4. Restart nginx:
   ```bash
   sudo systemctl restart nginx
   ```

### Environment Variables for Production

Add to your `.env`:
```env
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
```

## Management Commands

```bash
# View logs
docker compose --env-file listpull.env logs -f

# Restart
docker compose --env-file listpull.env restart

# Stop
docker compose --env-file listpull.env down

# Update
git pull
docker compose --env-file listpull.env up -d --build

# Backup database
docker cp listpull:/app/data/listpull.db ./backup-$(date +%Y%m%d).db

# Shell access
docker exec -it listpull sh
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

Ensure port 3000 is open:
```bash
sudo ufw allow 3000
```

### Reset admin password

```bash
docker exec -it listpull sh
# Delete old admin and recreate
sqlite3 /app/data/listpull.db "DELETE FROM users WHERE email='admin@store.com';"
ADMIN_PASSWORD=new-password node dist/db/seed.js
```

## Files

- `listpull.env` - All configuration (create from .env.example)
- `deploy/install.sh` - Installation script
- `deploy/uninstall.sh` - Uninstallation script
- `deploy/nginx.conf` - Nginx reverse proxy config
- `docker-compose.yml` - Docker orchestration
