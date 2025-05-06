#!/bin/bash
# This script helps load the extension in Chrome while ignoring __pycache__ and other files

# Navigate to the extension directory
cd "$(dirname "$0")"

# Create a temp directory for the extension without __pycache__
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/icons"

# Copy only the necessary files
cp manifest.json content.js styles.css "$TEMP_DIR/"
cp icons/*.png "$TEMP_DIR/icons/"

echo "Created a clean copy of the extension at $TEMP_DIR"
echo "Load this directory in Chrome extensions page"
echo "When done, you can delete the temp directory with:"
echo "rm -rf \"$TEMP_DIR\""
