# ZimaOS Troubleshooting Guide

## Viewing Container Logs

### Method 1: Via ZimaOS Web Interface
1. Open ZimaOS web interface
2. Navigate to **Docker** or **Apps** section
3. Find the `hairmanager` container
4. Click on the container name
5. Look for **"Logs"**, **"Console"**, or **"Terminal"** tab
6. View real-time logs

### Method 2: Via SSH (Command Line)

If you have SSH access to your ZimaOS server:

```bash
# View logs for the container
docker logs hairmanager

# Follow logs in real-time (like tail -f)
docker logs -f hairmanager

# View last 100 lines
docker logs --tail 100 hairmanager

# View logs with timestamps
docker logs -t hairmanager
```

### Method 3: Check Container Status

```bash
# List all containers (including stopped ones)
docker ps -a

# Check if container is running
docker ps | grep hairmanager

# Inspect container details
docker inspect hairmanager

# Check container exit code (if it stopped)
docker inspect hairmanager | grep -A 10 "State"
```

## Common Issues and Solutions

### Container Won't Start

1. **Check the logs first:**
   ```bash
   docker logs hairmanager
   ```

2. **Check if port 3001 is already in use:**
   ```bash
   netstat -tuln | grep 3001
   # or
   ss -tuln | grep 3001
   ```

3. **Check if the image was pulled successfully:**
   ```bash
   docker images | grep hairmanager
   ```

4. **Try starting manually to see errors:**
   ```bash
   docker run --rm -p 3001:3001 timknowlden/hairmanager:latest
   ```

### Container Starts But Immediately Stops

1. **Check exit code:**
   ```bash
   docker inspect hairmanager | grep ExitCode
   ```

2. **Common causes:**
   - Database initialization failed
   - Missing environment variables
   - Port conflict
   - Volume mount issues

### Database Issues

If you see database errors in logs:

1. **Check volume exists:**
   ```bash
   docker volume ls | grep hairmanager
   ```

2. **Inspect volume:**
   ```bash
   docker volume inspect hairmanager_data
   ```

3. **Check volume contents (if using bind mount):**
   ```bash
   ls -la /path/to/data
   ```

### Permission Issues

If you see permission denied errors:

```bash
# Check container user
docker exec hairmanager whoami

# Check file permissions in volume
docker exec hairmanager ls -la /app/data
```

## Debugging Steps

### Step 1: Check Container Status
```bash
docker ps -a | grep hairmanager
```

### Step 2: View Logs
```bash
docker logs hairmanager
```

### Step 3: Check Resource Usage
```bash
docker stats hairmanager
```

### Step 4: Test Health Endpoint
```bash
# If container is running
curl http://localhost:3001/api/health
```

### Step 5: Execute Commands Inside Container
```bash
# Open a shell inside the container
docker exec -it hairmanager sh

# Then inside the container:
ls -la /app
ls -la /app/data
cat /app/data/hairmanager.db  # Check if database exists
```

## Getting Help

When asking for help, provide:
1. **Container logs:** `docker logs hairmanager`
2. **Container status:** `docker ps -a | grep hairmanager`
3. **Docker version:** `docker --version`
4. **Compose file used:** Which compose file did you import?
5. **Error message:** Any specific error from ZimaOS interface?

## Quick Commands Reference

```bash
# View logs
docker logs hairmanager

# Follow logs
docker logs -f hairmanager

# Restart container
docker restart hairmanager

# Stop container
docker stop hairmanager

# Remove container (keeps volumes)
docker rm hairmanager

# Remove container and volumes (⚠️ deletes data)
docker rm -v hairmanager

# Pull latest image
docker pull timknowlden/hairmanager:latest

# List volumes
docker volume ls

# Remove volume (⚠️ deletes data)
docker volume rm hairmanager_data
```

