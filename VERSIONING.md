# Versioning Guide for HairManager

## Password Security ✅

**Yes, user passwords are fully secured:**
- Passwords are hashed using **bcrypt** with 10 salt rounds
- Passwords are **never stored in plain text**
- Stored as `password_hash` in the database
- Password verification uses `bcrypt.compare()` for secure comparison
- This is industry-standard password security

## Versioning for ZimaOS Updates

### How It Works

The application now uses **semantic versioning** to enable ZimaOS's "Check then update" feature:

1. **Version Source**: Version is read from `package.json` (currently `1.0.0`)
2. **Docker Image Labels**: Each Docker image includes version labels:
   - `org.opencontainers.image.version`
   - `version`
3. **Image Tags**: Images are tagged with:
   - `latest` (always points to the latest version)
   - `v1.0.0` (specific version tag)
   - `main` (branch tag)

### How to Update the Version

When you make changes and want to release a new version:

1. **Update `package.json`**:
   ```json
   {
     "version": "1.0.1"  // Increment as needed
   }
   ```

2. **Commit and push**:
   ```bash
   git add package.json
   git commit -m "Bump version to 1.0.1"
   git push origin main
   ```

3. **GitHub Actions will automatically**:
   - Build a new Docker image
   - Tag it with the new version (e.g., `v1.0.1`)
   - Push to both GHCR and Docker Hub
   - Include version labels in the image

### Using Version Tags in ZimaOS

You have two options:

#### Option 1: Use `latest` tag (Recommended)
- **File**: `docker-compose.image.ghcr.yml` or `docker-compose.dockerhub.yml`
- **Current setting**: `image: ghcr.io/timknowlden/hairmanager:latest`
- **Pros**: Always gets the latest version automatically
- **Cons**: ZimaOS "Check then update" may not detect changes if it only checks the tag name

#### Option 2: Use specific version tag
- **File**: `docker-compose.image.ghcr.yml`
- **Change to**: `image: ghcr.io/timknowlden/hairmanager:v1.0.0`
- **Pros**: More explicit, easier to track versions
- **Cons**: Requires manual update of docker-compose file for each version

### Making "Check then Update" Work

ZimaOS's "Check then update" feature checks for:
1. **Image digest changes** (most reliable)
2. **Version labels** in the image metadata
3. **Tag changes** (less reliable for `latest`)

**Best Practice:**
- Keep using `latest` tag in docker-compose
- When you want to update, use **Settings → Save** method (which forces a pull)
- Or manually pull: `docker-compose pull` then `docker-compose up -d`

### Version Labels in Images

Every image now includes:
```dockerfile
LABEL org.opencontainers.image.version="1.0.0"
LABEL version="1.0.0"
```

These labels allow ZimaOS to:
- Display the current version
- Compare versions for update detection
- Show version history

### Checking Current Version

To check the version of a running container:
```bash
docker inspect hairmanager | grep -i version
```

Or check the image:
```bash
docker image inspect ghcr.io/timknowlden/hairmanager:latest | grep -i version
```

## Summary

✅ **Passwords**: Fully secured with bcrypt hashing  
✅ **Versioning**: Semantic versioning implemented  
✅ **Update Detection**: Version labels added to images  
⚠️ **ZimaOS Update**: May still need "Settings → Save" method for reliable updates

