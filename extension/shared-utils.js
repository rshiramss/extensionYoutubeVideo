// Shared utilities for YouTube extension

// Theme detection utility
function detectYouTubeDarkMode() {
    return document.documentElement.getAttribute('dark') === 'true' || 
           document.querySelector('html[dark]') !== null ||
           document.querySelector('ytd-app')?.hasAttribute('dark') ||
           document.body.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Get current video information
function getCurrentVideoInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return { videoId, videoUrl };
}

// Format timestamp to seconds
function timestampToSeconds(timestamp) {
    const [minutes, seconds] = timestamp.split(':').map(Number);
    return minutes * 60 + seconds;
}

// Handle timestamp clicks
function handleTimestampClick(timestamp) {
    const seconds = timestampToSeconds(timestamp);
    const video = document.querySelector('video');
    if (video) {
        video.currentTime = seconds;
    }
}

// Apply theme-based styling
function getThemeStyles() {
    const isDarkMode = detectYouTubeDarkMode();
    
    return {
        isDarkMode,
        backgroundColor: isDarkMode ? '#1a1a1a' : '#f9f9f9',
        textColor: isDarkMode ? '#fff' : '#0f0f0f',
        borderColor: isDarkMode ? '#3ea6ff' : '#065fd4',
        pointBackgroundColor: isDarkMode ? '#2d2d2d' : '#ffffff',
        pointBorderColor: isDarkMode ? '#383838' : '#efefef',
        pointTextColor: isDarkMode ? '#aaa' : '#606060',
        timestampColor: isDarkMode ? '#3ea6ff' : '#065fd4',
        headerBorderColor: isDarkMode ? '#383838' : '#e5e5e5',
        loadingColor: isDarkMode ? '#aaa' : '#606060'
    };
}

// Check server connectivity
async function checkServerStatus(serverUrl = 'http://127.0.0.1:8000') {
    try {
        const response = await fetch(`${serverUrl}/`);
        console.log('Server status check:', response.status);
        return response.ok;
    } catch (error) {
        console.error('Server status check failed:', error.message);
        return false;
    }
}

// Show notification utility
function showNotification(message, type = 'error', duration = 10000) {
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.top = '10px';
    notification.style.right = '10px';
    notification.style.backgroundColor = type === 'error' ? '#ffebee' : '#e8f5e8';
    notification.style.color = type === 'error' ? '#cc0000' : '#2e7d32';
    notification.style.padding = '10px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '99999';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    notification.innerHTML = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}

// Export for use in other files (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        detectYouTubeDarkMode,
        getCurrentVideoInfo,
        timestampToSeconds,
        handleTimestampClick,
        getThemeStyles,
        checkServerStatus,
        showNotification
    };
}