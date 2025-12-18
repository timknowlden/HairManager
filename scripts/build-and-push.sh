#!/bin/bash

# Script to build and push HairManager Docker image to Docker Hub
# Usage: ./scripts/build-and-push.sh [your-dockerhub-username]

set -e

# Get Docker Hub username from argument or prompt
if [ -z "$1" ]; then
    read -p "Enter your Docker Hub username: " DOCKERHUB_USERNAME
else
    DOCKERHUB_USERNAME=$1
fi

if [ -z "$DOCKERHUB_USERNAME" ]; then
    echo "Error: Docker Hub username is required"
    exit 1
fi

IMAGE_NAME="$DOCKERHUB_USERNAME/hairmanager:latest"

echo "=========================================="
echo "Building HairManager Docker Image"
echo "=========================================="
echo "Image: $IMAGE_NAME"
echo ""

# Build the image
echo "Step 1: Building Docker image..."
docker build -t "$IMAGE_NAME" .

if [ $? -ne 0 ]; then
    echo "Error: Docker build failed"
    exit 1
fi

echo ""
echo "Step 2: Image built successfully!"
echo ""
read -p "Do you want to push to Docker Hub? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Step 3: Pushing to Docker Hub..."
    docker push "$IMAGE_NAME"
    
    if [ $? -ne 0 ]; then
        echo "Error: Docker push failed. Make sure you're logged in: docker login"
        exit 1
    fi
    
    echo ""
    echo "=========================================="
    echo "Success! Image pushed to Docker Hub"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Update docker-compose.image.yml:"
    echo "   Replace 'YOUR_DOCKERHUB_USERNAME' with '$DOCKERHUB_USERNAME'"
    echo ""
    echo "2. Or use this command to update it automatically:"
    echo "   sed -i 's/YOUR_DOCKERHUB_USERNAME/$DOCKERHUB_USERNAME/g' docker-compose.image.yml"
    echo ""
    echo "3. Import docker-compose.image.yml into ZimaOS"
    echo ""
else
    echo ""
    echo "Image built but not pushed."
    echo "To push later, run: docker push $IMAGE_NAME"
fi

