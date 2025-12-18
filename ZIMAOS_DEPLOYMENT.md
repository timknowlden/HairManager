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

1. **Prepare your files on ZimaOS**:
   - Copy the entire HairManager project folder to your ZimaOS server
   - Or clone it: `git clone https://github.com/timknowlden/HairManager.git`
   - Navigate to the folder: `cd HairManager`

2. **Create the data directory** (if it doesn't exist):
   ```bash
   mkdir -p data
   ```

3. **Copy your database** (if you have one):
   ```bash
   cp hairmanager.db data/hairmanager.db
   ```

4. **Import the Docker Compose file in ZimaOS**:
   - Open ZimaOS Docker management interface
   - Click "Import" or the import button
   - Select the "Docker Compose" tab
   - Upload or drag-and-drop the `docker-compose.yml` file
   - Click "Submit"

5. **Configure in ZimaOS** (if needed):
   - The application will be imported as "hairmanager"
   - You can customize the title, icon, and other settings in the ZimaOS interface
   - The port 3001 will be automatically configured

6. **Access the application**:
   - Open your browser and navigate to: `http://your-zimaos-ip:3001`
   - Or use the ZimaOS web UI link if configured

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

