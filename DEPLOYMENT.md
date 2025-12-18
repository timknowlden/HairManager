# HairManager Docker Deployment Guide

This guide will help you deploy HairManager on your ZimaOS home server using Docker.

## Prerequisites

- ZimaOS home server with Docker installed
- Git (to clone the repository)
- Port 3001 available (or change it in docker-compose.yml)

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone https://github.com/timknowlden/HairManager.git
   cd HairManager
   ```

2. **Create a data directory** for the database:
   ```bash
   mkdir -p data
   ```

3. **Copy your existing database** (if you have one):
   ```bash
   cp hairmanager.db data/hairmanager.db
   ```
   
   Or if you want to start fresh, the database will be created automatically.

4. **Build and start the container**:
   ```bash
   docker-compose up -d --build
   ```

5. **Check the logs** to ensure everything started correctly:
   ```bash
   docker-compose logs -f
   ```

6. **Access the application**:
   - Open your browser and navigate to: `http://your-server-ip:3001`
   - Or if you have a domain: `http://your-domain.com:3001`

## Configuration

### Port Configuration

To change the port, edit `docker-compose.yml`:
```yaml
ports:
  - "YOUR_PORT:3001"  # Change YOUR_PORT to your desired port
```

### API URL Configuration

**Important**: The application currently uses `http://localhost:3001/api` for API calls. For production deployment, you have two options:

#### Option 1: Use Relative URLs (Recommended)

Before building, run the fix script to replace localhost URLs with relative URLs:

```bash
chmod +x scripts/fix-api-urls.sh
./scripts/fix-api-urls.sh
```

This will replace all `http://localhost:3001/api` with `/api` in the source files. Then rebuild:

```bash
docker-compose up -d --build
```

#### Option 2: Access via Server IP

If you keep the localhost URLs, you can only access the application from the server itself. For remote access, you'll need to use Option 1 or set up a reverse proxy.

#### Option 3: Use Environment Variable (Advanced)

You can modify the Dockerfile to use an environment variable for the API URL, but this requires code changes to read from `import.meta.env`.

### Database Persistence

The database is stored in the `./data` directory, which is mounted as a volume. This ensures your data persists even if you rebuild the container.

### Environment Variables

You can add environment variables to `docker-compose.yml`:
```yaml
environment:
  - NODE_ENV=production
  - PORT=3001
  # Add any other environment variables here
```

## Updating the Application

1. **Pull the latest changes**:
   ```bash
   git pull
   ```

2. **Rebuild and restart**:
   ```bash
   docker-compose up -d --build
   ```

## Stopping the Application

```bash
docker-compose down
```

## Viewing Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View logs for the last 100 lines
docker-compose logs --tail=100
```

## Backup

To backup your database:

```bash
# Stop the container
docker-compose down

# Copy the database file
cp data/hairmanager.db data/hairmanager.db.backup-$(date +%Y%m%d)

# Start the container again
docker-compose up -d
```

## Troubleshooting

### Container won't start

1. Check the logs: `docker-compose logs`
2. Ensure port 3001 is not in use: `netstat -tuln | grep 3001`
3. Check Docker is running: `docker ps`

### Database issues

1. Ensure the `data` directory exists and is writable
2. Check file permissions: `ls -la data/`
3. If needed, fix permissions: `chmod 755 data && chmod 644 data/hairmanager.db`

### Can't access the application

1. Check the container is running: `docker ps`
2. Check the logs: `docker-compose logs`
3. Verify the port is correct in `docker-compose.yml`
4. Check your firewall settings on ZimaOS

## Reverse Proxy (Optional)

If you want to use a reverse proxy (like Nginx or Traefik) to access the app without the port number:

### Nginx Example

```nginx
server {
    listen 80;
    server_name hairmanager.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Health Check

The application includes a health check endpoint at `/api/health`. You can test it:

```bash
curl http://localhost:3001/api/health
```

This should return: `{"status":"ok"}`

## Support

For issues or questions, please check the GitHub repository or create an issue.

