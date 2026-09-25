# Badrockplyr VPS Deployment

This deployment runs Badrockplyr with Docker Compose, PostgreSQL, Redis, a scrape worker, and Caddy for automatic HTTPS.

## 1. Prepare the VPS

Use Ubuntu 22.04 or 24.04. Point your domain A record to the VPS public IP before starting Caddy.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Log out and back in after adding your user to the Docker group.

## 2. Upload the project

```bash
git clone <your-repo-url> badrockplyr
cd badrockplyr
cp .env.example.production .env.production
nano .env.production
```

Set:

- `APP_DOMAIN` to your real domain.
- `NEXT_PUBLIC_APP_URL` to `https://your-domain`.
- `POSTGRES_PASSWORD` to a long random password.
- `TMDB_API_KEY` to your TMDB key.
- Optional proxy subscription in `OUTBOUND_PROXY_URLS`.

## 3. Start the stack

```bash
docker compose --env-file .env.production up -d --build postgres redis
docker compose --env-file .env.production run --rm app npm run db:migrate
docker compose --env-file .env.production up -d --build
```

Verify:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f app
```

Open `https://your-domain/dashboard`.

## 4. Migrate existing SQLite data

Copy your current `dev.db` to the project root on the VPS, then run:

```bash
docker compose --env-file .env.production run --rm app npm run db:migrate-data
```

The script prints counts for each table and fails if PostgreSQL has fewer records than SQLite.

## 5. Proxy configuration

Use a comma-separated list:

```bash
OUTBOUND_PROXY_MODE=optional
OUTBOUND_PROXY_URLS=http://user:pass@proxy1:8000,http://user:pass@proxy2:8000
```

Modes:

- `off`: never use proxies.
- `optional`: use proxies when configured.
- `required`: fail external scraping if no proxy is configured.

## 6. Operations

Update deployment:

```bash
git pull
docker compose --env-file .env.production run --rm app npm run db:migrate
docker compose --env-file .env.production up -d --build
```

Back up PostgreSQL:

```bash
docker compose --env-file .env.production exec postgres pg_dump -U badrockplyr badrockplyr > badrockplyr-backup.sql
```
