# Updating HairManager on ZimaOS

## How Updates Work

### Automatic Build Process
Every time you push code to the `main` branch on GitHub, the GitHub Actions workflow automatically:
1. Builds a new Docker image
2. Pushes it to GitHub Container Registry (GHCR) with the `main` tag
3. Copies it to Docker Hub with the `latest` tag

### Current Image Tags
- **GHCR**: `ghcr.io/timknowlden/hairmanager:main`
- **Docker Hub**: `timknowlden/hairmanager:latest`

## How to Update on ZimaOS

### ⚠️ Important: ZimaOS Update Behavior

**Known Issue:** The "Check then update" feature in ZimaOS may not always detect new versions correctly. If it says "up to date" but you know there's a new version:

1. **Use Settings → Save method** (see Option 1b below)
2. Or manually pull via SSH (Option 2)

### Option 1a: Using "Check then update" Button
1. Open ZimaOS web interface
2. Navigate to your HairManager app
3. Click the three-dot menu (⋮)
4. Click "Check then update"
5. **Note:** This may not always detect updates - if it says "up to date" but you know there's a new version, use Option 1b

### Option 1b: Using Settings → Save (Reliable Method)
1. Open ZimaOS web interface
2. Navigate to your HairManager app
3. Click the three-dot menu (⋮)
4. Click "Settings"
5. Click "Save" (even without making changes)
6. This will trigger a pull and restart, ensuring you get the latest version

### Option 2: Using SSH (If web interface doesn't have update button)
1. SSH into your ZimaOS server
2. Navigate to your app directory (usually where the docker-compose file is)
3. Run these commands:

```bash
# Pull the latest image
docker-compose -f docker-compose.image.ghcr.yml pull

# Recreate the container with the new image
docker-compose -f docker-compose.image.ghcr.yml up -d
```

Or if using Docker Hub:
```bash
docker-compose -f docker-compose.dockerhub.yml pull
docker-compose -f docker-compose.dockerhub.yml up -d
```

### Option 3: Force Pull Latest (If Docker is caching)
If Docker is using a cached image, force it to pull:

```bash
# Remove the old image first
docker rmi ghcr.io/timknowlden/hairmanager:main

# Or for Docker Hub:
docker rmi timknowlden/hairmanager:latest

# Then pull and restart
docker-compose -f docker-compose.image.ghcr.yml pull
docker-compose -f docker-compose.image.ghcr.yml up -d
```

## Data Persistence

### ✅ Your Data Will Remain Safe

**Important:** Your data is stored separately from the container and will persist through updates.

### How Data Persistence Works

1. **Named Volume (GHCR setup):**
   - Data is stored in a Docker volume named `hairmanager_data`
   - This volume is independent of the container
   - When you update, the old container is removed but the volume remains
   - The new container attaches to the same volume

2. **Bind Mount (Docker Hub setup):**
   - Data is stored at `/media/nvme/AppData/hairmanager` on your host
   - This is a direct folder on your server
   - Updates only replace the container, not the folder

### What Gets Preserved
- ✅ All appointments
- ✅ All locations
- ✅ All services
- ✅ User accounts and passwords
- ✅ Admin settings (email relay, signatures, etc.)
- ✅ Database file (`hairmanager.db`)

### What Gets Updated
- ✅ Application code (React frontend, Node.js backend)
- ✅ Dependencies and packages
- ✅ Bug fixes and new features

## Update Process Flow

```
1. You push code to GitHub
   ↓
2. GitHub Actions builds new image
   ↓
3. New image pushed to registry
   ↓
4. You trigger update on ZimaOS
   ↓
5. Docker pulls new image
   ↓
6. Old container stops
   ↓
7. New container starts with same volume/mount
   ↓
8. Your data is still there! ✅
```

## Troubleshooting Updates

### If Update Doesn't Work

1. **Check if new image exists:**
   ```bash
   docker images | grep hairmanager
   ```

2. **Check container logs:**
   ```bash
   docker logs hairmanager
   ```

3. **Force recreate:**
   ```bash
   docker-compose -f docker-compose.image.ghcr.yml down
   docker-compose -f docker-compose.image.ghcr.yml pull
   docker-compose -f docker-compose.image.ghcr.yml up -d
   ```

### If Data Seems Missing

1. **Check volume exists:**
   ```bash
   docker volume ls | grep hairmanager
   ```

2. **Check bind mount exists (Docker Hub setup):**
   ```bash
   ls -la /media/nvme/AppData/hairmanager
   ```

3. **Verify volume is attached:**
   ```bash
   docker inspect hairmanager | grep -A 10 Mounts
   ```

## Best Practices

1. **Backup Before Major Updates:**
   - Use the "Backup All Data" feature in Admin Manager
   - Or manually copy the database file

2. **Check GitHub Actions:**
   - Visit: https://github.com/timknowlden/HairManager/actions
   - Ensure the build completed successfully before updating

3. **Update During Low Usage:**
   - Updates cause a brief downtime (usually 10-30 seconds)
   - Schedule during off-hours if possible

4. **Monitor After Update:**
   - Check the app loads correctly
   - Verify data is still accessible
   - Check logs for any errors

## Version Tags (Future Enhancement)

Currently using `main` and `latest` tags. For more control, you could:

1. **Create a version tag:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Update docker-compose to use specific version:**
   ```yaml
   image: ghcr.io/timknowlden/hairmanager:v1.0.0
   ```

This allows you to control exactly which version runs and makes rollbacks easier.

