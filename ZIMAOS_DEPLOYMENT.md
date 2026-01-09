# ZimaOS Deployment Guide

This guide will help you deploy HairManager on ZimaOS using the Docker Compose import feature.

## Deployment Options

### Option 1: GitHub Container Registry (Recommended - Automatic & Free) ⭐

**This is the easiest option!** The image is automatically built and pushed to GitHub Container Registry whenever you push code.

1. **Push your code to GitHub** (if not already done):
   ```bash
   git push
   ```

2. **Make the package public** (one-time, if needed):
   - Go to: https://github.com/timknowlden/HairManager/pkgs/container/hairmanager
   - Click "Package settings" → "Change visibility" → "Public"

3. **Import `docker-compose.image.yml`** into ZimaOS
   - It's already configured with `ghcr.io/timknowlden/hairmanager:latest`
   - ZimaOS will pull the pre-built image automatically

**Benefits**: Completely automatic, free, no manual build steps!

### Option 2: Docker Hub (Manual)

This option uses a pre-built Docker image from Docker Hub.

1. **Build and push the image to Docker Hub** (one-time setup):
   ```bash
   chmod +x scripts/build-and-push.sh
   ./scripts/build-and-push.sh your-dockerhub-username
   ```
   
   Or manually:
   ```bash
   docker login
   docker build -t your-username/hairmanager:latest .
   docker push your-username/hairmanager:latest
   ```

2. **Update docker-compose.image.yml**:
   - Replace `YOUR_DOCKERHUB_USERNAME` with your actual Docker Hub username
   - Or use: `sed -i 's/YOUR_DOCKERHUB_USERNAME/your-username/g' docker-compose.image.yml`

3. **Import `docker-compose.image.yml`** into ZimaOS

### Option 2: Build from Source

This option builds the image locally in ZimaOS (slower but no Docker Hub needed).

1. **Import `docker-compose.yml`** directly into ZimaOS
2. ZimaOS will build the image automatically

## Quick Import Steps (Option 1 - Recommended)

### Step 1: Verify the image is available

**For GitHub Container Registry (Recommended):**
- Check: https://github.com/timknowlden/HairManager/pkgs/container/hairmanager
- If it's private, make it public:
  - Click "Package settings" (gear icon)
  - Scroll to "Danger Zone"
  - Click "Change visibility" → "Public"

**For Docker Hub (if you configured secrets):**
- Check: https://hub.docker.com/r/timknowlden/hairmanager
- Make sure it's public (Docker Hub free tier allows 1 private repo)

### Step 2: Import into ZimaOS

1. **Open ZimaOS Docker management interface**

2. **Click "Import"** (or the import button)

3. **Select the "Docker Compose" tab**

4. **Choose your compose file:**
   - **For GitHub Container Registry** (recommended): Use `docker-compose.image.ghcr.yml`
   - **For Docker Hub**: Use `docker-compose.image.yml`
   
   Upload or drag-and-drop the file

5. **Click "Submit"**

   ZimaOS will:
   - Pull the pre-built image from the registry
   - Create the container
   - Set up port 3001
   - Mount the data volume for database persistence

### Step 3: Create data directory (if needed)

If the container fails to start due to missing data directory:

1. **SSH into your ZimaOS server** (or use terminal in ZimaOS)
2. **Navigate to where ZimaOS stores Docker volumes** (usually `/var/lib/docker/volumes/` or similar)
3. **Create the data directory:**
   ```bash
   mkdir -p /path/to/hairmanager/data
   chmod 755 /path/to/hairmanager/data
   ```

   Or, if you're using bind mounts, create it in the project directory:
   ```bash
   cd /path/to/HairManager
   mkdir -p data
   chmod 755 data
   ```

### Step 4: Access the application

Once the container is running:
- Open: `http://your-zimaos-ip:3001`
- Or use the ZimaOS web UI link if configured

### Step 5: First-time setup

1. **Register a new user account** (or use existing credentials if you imported a database)
2. **Configure your profile settings**
3. **Set up SendGrid email settings** (if you want to use email invoices)
4. **Start using HairManager!**

## Important Notes

### API URLs
The application uses `http://localhost:3001/api` for API calls. Since ZimaOS will handle the networking, this should work when accessing via the ZimaOS interface. If you need to access from a different domain/IP, you may need to:

1. Run the API URL fix script before importing:
   ```bash
   chmod +x scripts/fix-api-urls.sh
   ./scripts/fix-api-urls.sh
   ```

2. Then rebuild/import again

### Database Persistence
The database is stored in the `./data` directory, which is mounted as a volume. This ensures your data persists even if you rebuild the container.

### Updating
To update the application:

1. Pull the latest changes:
   ```bash
   git pull
   ```

2. Rebuild in ZimaOS:
   - Use the ZimaOS interface to rebuild the container
   - Or use command line: `docker-compose up -d --build` from the project directory

## Troubleshooting

### Container won't start
- Check the logs in ZimaOS Docker interface
- Ensure port 3001 is available
- Verify the `data` directory exists and is writable

### Can't access the application
- Check the container is running in ZimaOS
- Verify the port mapping (3001:3001)
- Check ZimaOS firewall settings

### Database issues
- Ensure the `data` directory exists: `mkdir -p data`
- Check file permissions: `chmod 755 data`
- Verify the database file is in the data directory

## Alternative: Manual Docker Compose

If you prefer to use command line instead of the ZimaOS interface:

```bash
cd /path/to/HairManager
docker-compose up -d --build
```

Check status:
```bash
docker-compose ps
docker-compose logs -f
```

