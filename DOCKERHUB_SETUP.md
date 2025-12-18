# Docker Hub Setup for HairManager

This guide will help you set up automatic pushes to Docker Hub via GitHub Actions.

## Step 1: Create Docker Hub Account

1. Go to https://hub.docker.com
2. Sign up for a free account (if you don't have one)
3. Note your username

## Step 2: Create Docker Hub Access Token

1. Go to: https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Give it a name: "HairManager GitHub Actions"
4. Set permissions: "Read, Write & Delete" (or at least "Read & Write")
5. Click "Generate"
6. **Copy the token immediately** (you won't see it again!)

## Step 3: Add Secrets to GitHub

1. Go to your GitHub repo: https://github.com/timknowlden/HairManager
2. Click "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add two secrets:

   **Secret 1:**
   - Name: `DOCKERHUB_USERNAME`
   - Value: Your Docker Hub username

   **Secret 2:**
   - Name: `DOCKERHUB_TOKEN`
   - Value: The access token you just created

## Step 4: Update docker-compose.image.yml

The file is already updated to use: `timknowlden/hairmanager:latest`

If your Docker Hub username is different, update line 15 in `docker-compose.image.yml`:
```yaml
image: YOUR_USERNAME/hairmanager:latest
```

## Step 5: Trigger the Workflow

1. Go to: https://github.com/timknowlden/HairManager/actions/workflows/docker-build.yml
2. Click "Run workflow"
3. Select your branch
4. Click "Run workflow"

The workflow will now:
- Build the image
- Push to GitHub Container Registry (ghcr.io)
- Push to Docker Hub (docker.io) - **automatically!**

## Step 6: Import to ZimaOS

Once the build completes:
1. Import `docker-compose.image.yml` into ZimaOS
2. It will pull from Docker Hub: `timknowlden/hairmanager:latest`
3. Should work without registry mirror issues!

## Future Updates

Every time you push code, the workflow will automatically:
- Build a new image
- Push to both GitHub Container Registry AND Docker Hub
- Tag as `latest`

You can then update the container in ZimaOS to get the latest version.

## Troubleshooting

**If the workflow fails:**
- Check that both secrets are set correctly
- Verify your Docker Hub token has the right permissions
- Check the Actions logs for specific errors

**If ZimaOS still can't pull:**
- Verify the image exists: https://hub.docker.com/r/timknowlden/hairmanager
- Make sure it's public (Docker Hub free tier allows 1 private repo)
- Try pulling manually: `docker pull timknowlden/hairmanager:latest`

