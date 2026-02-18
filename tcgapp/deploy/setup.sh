#!/bin/bash
set -euo pipefail

echo "=== TCG Price Tracker Server Setup ==="

echo "Updating system packages..."
apt update && apt upgrade -y

echo "Installing dependencies..."
apt install -y python3.12 python3.12-venv python3-pip postgresql postgresql-contrib nginx git

echo "Configuring PostgreSQL..."
sudo -u postgres createuser -s tcgapp 2>/dev/null || true
sudo -u postgres createdb tcgapp -O tcgapp 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER tcgapp PASSWORD 'tcgapp-prod-2026';" 2>/dev/null || true

echo "Setting up application..."
mkdir -p /opt/tcgapp
if [ ! -d "/opt/tcgapp/.git" ]; then
    cd /opt
    git clone https://github.com/jasondowney/Code.git tcgapp
else
    cd /opt/tcgapp
    git pull
fi

cd /opt/tcgapp/tcgapp
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "Configuring environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "IMPORTANT: Edit /opt/tcgapp/tcgapp/.env with your API key and database URL"
fi

echo "Running database migrations..."
python -m alembic upgrade head

echo "Setting up systemd service..."
cp deploy/tcgapp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable tcgapp

echo "Setting up Nginx..."
rm -f /etc/nginx/sites-enabled/default
cp deploy/nginx.conf /etc/nginx/sites-available/tcgapp
ln -sf /etc/nginx/sites-available/tcgapp /etc/nginx/sites-enabled/
nginx -t

echo "Setting permissions..."
chown -R www-data:www-data /opt/tcgapp/tcgapp/static

echo "Starting services..."
systemctl start tcgapp
systemctl reload nginx

echo "Setting up nightly cron..."
CRON_LINE="30 20 * * * /opt/tcgapp/tcgapp/venv/bin/python /opt/tcgapp/tcgapp/scripts/ingest.py >> /var/log/tcgapp-ingest.log 2>&1"
(crontab -l 2>/dev/null | grep -v "tcgapp"; echo "$CRON_LINE") | crontab -

echo "=== Setup complete ==="
echo "App should be running on port 80"
systemctl status tcgapp --no-pager
