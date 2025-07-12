# YouTube Video Summarizer Extension

A Chrome extension that provides AI-powered summaries of YouTube videos with clickable timestamps.

## Project Structure

```
├── extension/           # Chrome extension files
│   ├── manifest.json   # Extension manifest
│   ├── content.js      # Main content script
│   ├── shared-utils.js # Shared utility functions
│   ├── popup.html      # Extension popup
│   ├── popup.js        # Popup functionality
│   └── styles.css      # Extension styles
├── server/             # Backend server
│   ├── server.py       # Flask server for summarization
│   └── requirements.txt # Python dependencies
├── utils/              # Utility scripts
│   ├── create_icons.py # Icon generation script
│   ├── main.py         # Main utility script
│   ├── prepare_extension.sh # Extension preparation
│   └── test_fix.sh     # Testing script
└── icons/              # Extension icons
    ├── icon.svg
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Features

- **Video Summarization**: AI-powered summaries using Google's Gemini API
- **Clickable Timestamps**: Jump to specific parts of the video
- **Dark/Light Theme Support**: Automatically adapts to YouTube's theme
- **Clean Integration**: Seamlessly integrates into YouTube's sidebar

## Installation

1. **Set up the server**:
   ```bash
   cd server/
   pip install -r requirements.txt
   python server.py
   ```

2. **Load the extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/` folder

## Usage

1. Navigate to any YouTube video
2. The extension will automatically generate a summary in the sidebar
3. Click on timestamps to jump to specific parts
4. Use the popup to check server status

## Development

### Recent Changes

- **Removed Notes/Mind Map**: Simplified to focus on core summarization
- **Backup files**: Removed `.bak` files
- **Multiple servers**: Consolidated to single production server
- **Duplicate code**: Extracted common functions to `shared-utils.js`

### Code Organization

- Organized files into logical folders
- Shared utilities for common functionality
- Consistent theming across components
- Streamlined architecture focused on summarization

## API Keys

The server requires a Google Gemini API key. Set it in your environment or update the server configuration.

## License

This project is for educational and personal use.