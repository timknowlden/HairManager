# Data Persistence Guide

## Important: Your Data is Stored in Docker Volumes

When you update the Docker image, your data should **NOT** be lost. The database is stored in a Docker volume that persists independently of the container.

## How Data Persistence Works

### Named Volume (GHCR Setup)
- **Volume Name**: `hairmanager_data`
- **Mount Point**: `/app/data` inside the container
- **Database File**: `/app/data/hairmanager.db`
- **Location**: Managed by Docker (usually in `/var/lib/docker/volumes/`)

### Bind Mount (Docker Hub Setup)
- **Host Path**: `/media/nvme/AppData/hairmanager`
- **Mount Point**: `/app/data` inside the container
- **Database File**: `/app/data/hairmanager.db`
- **Location**: Direct folder on your server

## Why Data Might Be Lost

### ❌ Common Mistakes That Cause Data Loss:

1. **Removing the Volume**
   ```bash
   # DON'T DO THIS - removes the volume and all data
   docker-compose down -v
   docker volume rm hairmanager_data
   ```

2. **Using `docker-compose down -v`**
   - The `-v` flag removes volumes
   - Use `docker-compose down` without `-v` to preserve volumes

3. **Recreating the Volume**
   - If the volume name changes, a new empty volume is created
   - Always use the same volume name in docker-compose

4. **Wrong Update Procedure**
   - Pulling a new image should NOT remove the volume
   - Only the container is replaced, not the volume

## ✅ Correct Update Procedure

### Option 1: Using docker-compose (Recommended)

```bash
# 1. Pull the new image
docker-compose -f docker-compose.image.ghcr.yml pull

# 2. Stop and remove ONLY the container (NOT the volume)
docker-compose -f docker-compose.image.ghcr.yml down

# 3. Start with the new image (volume is automatically reattached)
docker-compose -f docker-compose.image.ghcr.yml up -d
```

### Option 2: Using ZimaOS Web Interface

1. Navigate to your HairManager app
2. Click "Update" or "Refresh" button
3. **DO NOT** click "Remove" or "Delete" - this might remove the volume
4. The update should preserve your volume

### Option 3: Manual Docker Commands

```bash
# 1. Pull new image
docker pull ghcr.io/timknowlden/hairmanager:main

# 2. Stop the container (volume stays)
docker stop hairmanager

# 3. Remove ONLY the container (NOT the volume)
docker rm hairmanager

# 4. Start new container with same volume
docker-compose -f docker-compose.image.ghcr.yml up -d
```

## Verify Your Volume is Preserved

### Check if Volume Exists

```bash
# List all volumes
docker volume ls | grep hairmanager

# Inspect the volume
docker volume inspect hairmanager_data
```

### Check if Volume is Attached

```bash
# Check container mounts
docker inspect hairmanager | grep -A 10 Mounts
```

You should see:
```json
"Mounts": [
  {
    "Type": "volume",
    "Name": "hairmanager_data",
    "Source": "/var/lib/docker/volumes/hairmanager_data/_data",
    "Destination": "/app/data",
    "Driver": "local"
  }
]
```

### Verify Database File Exists

```bash
# Check if database file exists in volume
docker exec hairmanager ls -la /app/data/

# Should show: hairmanager.db
```

## Backup Before Updates

### Manual Backup

```bash
# 1. Backup the database file
docker exec hairmanager cp /app/data/hairmanager.db /app/data/hairmanager.db.backup

# 2. Copy backup to host (for named volume)
docker cp hairmanager:/app/data/hairmanager.db.backup ./hairmanager.db.backup

# Or for bind mount, just copy directly:
cp /media/nvme/AppData/hairmanager/hairmanager.db /media/nvme/AppData/hairmanager/hairmanager.db.backup
```

### Using the App's Backup Feature

1. Go to Admin Manager
2. Click "Backup All Data"
3. Save the JSON file to your computer

## Restore from Backup

### If Data is Lost

```bash
# 1. Stop the container
docker stop hairmanager

# 2. Restore database file
# For named volume:
docker run --rm -v hairmanager_data:/data -v $(pwd):/backup alpine \
  cp /backup/hairmanager.db.backup /data/hairmanager.db

# For bind mount:
cp /path/to/backup/hairmanager.db /media/nvme/AppData/hairmanager/hairmanager.db

# 3. Start container
docker-compose -f docker-compose.image.ghcr.yml up -d
```

## Troubleshooting

### Issue: Data Disappears After Update

**Check:**
1. Is the volume still attached?
   ```bash
   docker inspect hairmanager | grep Mounts
   ```

2. Does the database file exist?
   ```bash
   docker exec hairmanager ls -la /app/data/
   ```

3. Check container logs for errors:
   ```bash
   docker logs hairmanager
   ```

### Issue: Volume Not Found

If the volume was accidentally removed:

1. **Check if it still exists:**
   ```bash
   docker volume ls | grep hairmanager
   ```

2. **If missing, check for backups:**
   - Look for `hairmanager.db.backup` files
   - Check if you used the app's backup feature

3. **If no backup, data is lost** - you'll need to re-enter it

### Issue: Multiple Volumes

If you see multiple `hairmanager_data` volumes:

```bash
# List all volumes
docker volume ls

# Remove unused volumes (CAREFUL - only if you're sure they're empty)
docker volume prune
```

## Best Practices

1. **Always Backup Before Major Updates**
   - Use the app's "Backup All Data" feature
   - Or manually backup the database file

2. **Never Use `-v` Flag with `docker-compose down`**
   ```bash
   # ✅ Good
   docker-compose down
   
   # ❌ Bad (removes volumes)
   docker-compose down -v
   ```

3. **Verify Volume Before Removing Container**
   ```bash
   # Check volume exists
   docker volume inspect hairmanager_data
   ```

4. **Use Consistent docker-compose File**
   - Always use the same docker-compose file
   - Don't switch between different compose files without checking volumes

5. **Monitor Container Logs After Update**
   ```bash
   docker logs -f hairmanager
   ```
   Look for database connection errors or initialization issues

## Quick Reference

| Action | Command | Preserves Data? |
|--------|---------|----------------|
| Pull new image | `docker-compose pull` | ✅ Yes |
| Stop container | `docker-compose down` | ✅ Yes |
| Stop + remove volumes | `docker-compose down -v` | ❌ **NO** |
| Remove volume | `docker volume rm hairmanager_data` | ❌ **NO** |
| Update container | `docker-compose up -d` | ✅ Yes |
| Restart container | `docker restart hairmanager` | ✅ Yes |

## Need Help?

If your data disappeared:
1. Check if the volume still exists
2. Check container logs for errors
3. Verify the volume is attached to the container
4. Check for backup files
5. If all else fails, restore from backup

