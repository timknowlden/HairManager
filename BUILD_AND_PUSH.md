# Building and Pushing HairManager Docker Image

This guide will help you build and push the HairManager Docker image to Docker Hub so ZimaOS can pull it directly.

## Prerequisites

- Docker installed
- Docker Hub account (free at https://hub.docker.com)
- Docker Hub credentials configured locally

## Steps

### 1. Login to Docker Hub

```bash
docker login
```

Enter your Docker Hub username and password when prompted.

### 2. Build the Image

From the HairManager directory:

```bash
docker build -t YOUR_DOCKERHUB_USERNAME/hairmanager:latest .
```

Replace `YOUR_DOCKERHUB_USERNAME` with your actual Docker Hub username.

### 3. Push to Docker Hub

```bash
docker push YOUR_DOCKERHUB_USERNAME/hairmanager:latest
```

### 4. Update docker-compose.yml

After pushing, update the `image:` field in `docker-compose.yml` to use your Docker Hub image:

```yaml
image: YOUR_DOCKERHUB_USERNAME/hairmanager:latest
```

### 5. Import to ZimaOS

Now you can import the `docker-compose.yml` file into ZimaOS and it will pull the pre-built image directly.

## Quick Script

You can also use this script to automate the process:

```bash
#!/bin/bash
DOCKERHUB_USERNAME="your-username"
docker build -t $DOCKERHUB_USERNAME/hairmanager:latest .
docker push $DOCKERHUB_USERNAME/hairmanager:latest
echo "Image pushed! Update docker-compose.yml with: $DOCKERHUB_USERNAME/hairmanager:latest"
```

## Updating the Image

When you make changes:

1. Rebuild: `docker build -t YOUR_DOCKERHUB_USERNAME/hairmanager:latest .`
2. Push: `docker push YOUR_DOCKERHUB_USERNAME/hairmanager:latest`
3. In ZimaOS, restart/redeploy the container to pull the new image

