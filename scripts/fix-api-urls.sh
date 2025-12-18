#!/bin/bash
# Script to replace localhost API URLs with relative URLs for production
# Run this before building for production deployment

echo "Replacing localhost API URLs with relative URLs..."

# Find and replace in all JS/JSX files
find src -type f \( -name "*.js" -o -name "*.jsx" \) -exec sed -i.bak "s|http://localhost:3001/api|/api|g" {} \;

echo "Done! Backup files created with .bak extension"
echo "Review the changes and remove .bak files if satisfied"

