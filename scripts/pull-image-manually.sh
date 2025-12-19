#!/bin/bash
# Script to manually pull the image on ZimaOS server
# Run this on your ZimaOS server via SSH

echo "Pulling HairManager image from GitHub Container Registry..."

# Login to GitHub Container Registry (if needed)
# docker login ghcr.io -u YOUR_GITHUB_USERNAME

# Pull the image
docker pull ghcr.io/timknowlden/hairmanager:latest

echo "Image pulled successfully!"
echo "Now you can import docker-compose.image.yml in ZimaOS"

