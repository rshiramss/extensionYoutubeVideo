// filepath: /Users/rishits/Documents/extensionYoutubeVideo/content.js

// Global variables for user identification
let clientGeneratedUserId = null;
let databaseUserId = null;

// Define the server URL globally
const serverUrl = 'http://127.0.0.1:8000';

// Get current video information
function getCurrentVideoInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return { videoId, videoUrl };
}

// Detect YouTube theme
function detectYouTubeDarkMode() {
    return document.documentElement.getAttribute('dark') === 'true' || 
           document.querySelector('html[dark]') !== null ||
           document.querySelector('ytd-app')?.hasAttribute('dark') ||
           document.body.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Create and inject the summary container
function createSummaryContainer() {
    console.log('Creating and injecting summary container');
    
    const container = document.createElement('div');
    container.className = 'yt-summary-container';
    
    // Get theme
    const isDarkMode = detectYouTubeDarkMode();
    console.log('YouTube dark mode detected:', isDarkMode);
    
    // Apply theme-appropriate styles with increased visibility and top position styling
    if (isDarkMode) {
        container.style.backgroundColor = '#1a1a1a';
        container.style.border = '2px solid #3ea6ff'; // Bright YouTube blue border in dark mode
        container.style.color = '#fff';
        // No left border - we'll use a top border instead to indicate "top content"
    } else {
        container.style.backgroundColor = '#f9f9f9';
        container.style.border = '2px solid #065fd4'; // YouTube blue border in light mode
        container.style.color = '#0f0f0f';
        // No left border - we'll use a top border instead to indicate "top content"
    }
    
    // Add a top border to clearly indicate this is at the top of recommendations
    container.style.borderTop = isDarkMode ? '5px solid #3ea6ff' : '5px solid #065fd4';
    
    // Enhanced basic styles for better visibility
    container.style.borderRadius = '8px';
    container.style.padding = '16px';
    container.style.margin = '0 0 16px 0';
    container.style.boxShadow = isDarkMode ? 
                            '0 2px 12px rgba(62, 166, 255, 0.3)' : 
                            '0 2px 12px rgba(6, 95, 212, 0.2)';
    container.style.width = '100%';
    container.style.display = 'block'; 
    container.style.boxSizing = 'border-box';
    container.style.fontSize = '14px';
    container.style.position = 'relative';
    container.style.zIndex = '50'; // Ensure it's above most YouTube elements
    
    // Header styling
    const headerBorderColor = isDarkMode ? '#383838' : '#e5e5e5';
    const titleColor = isDarkMode ? '#fff' : '#0f0f0f';
    const loadingColor = isDarkMode ? '#aaa' : '#606060';
    
    // Build container HTML
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid ${headerBorderColor};">
            <div style="font-size: 16px; font-weight: 500; color: ${titleColor};">Video Summary</div>
        </div>
        <div class="yt-summary-content">
            <div style="text-align: center; padding: 20px; color: ${loadingColor};">
                <div style="margin-bottom: 10px; font-weight: bold;">Generating summary...</div>
                <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid rgba(255,0,0,0.3); border-radius: 50%; border-top-color: #ff0000; animation: yt-summary-spin 1s ease-in-out infinite;"></div>
                <div style="margin-top: 10px; font-size: 12px;">This may take a moment as the server processes the video transcript.</div>
                <style>
                    @keyframes yt-summary-spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
            </div>
        </div>
    `;
    
    // Find appropriate insertion point
    console.log('Looking for insertion point in YouTube DOM...');
    
    // Look for common YouTube elements
    const secondary = document.querySelector('#secondary');
    const related = document.querySelector('#related');
    const secondaryInner = document.querySelector('#secondary-inner');
    const comments = document.querySelector('#comments');
    const belowPlayer = document.querySelector('#below');
    const primary = document.querySelector('#primary');
    const primaryInner = document.querySelector('#primary-inner');
    
    // Look for ad elements where we want to place our summary - with much more specific targeting
    // Added more specific selectors to target sidebar ads like the one in the screenshot
    const adSelectors = [
        // Target sidebar ads specifically
        'ytd-ad-slot-renderer', 
        'ytd-promoted-video-renderer',
        'ytd-display-ad-renderer',
        'ytd-compact-promoted-video-renderer',
        'ytd-statement-banner-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-ad-promo-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-promoted-sparkles-text-search-renderer',
        '.ytd-watch-next-secondary-results-renderer.sparkles-light-cta',
        '[id*="player-ads"]', 
        '[id*="masthead-ad"]', 
        '[id$="-ad"]', 
        '[id*="promotion"]'
    ];
    
    // Find all possible ad slots
    let adSlot = null;
    
    // First method: Try direct selectors
    for (const selector of adSelectors) {
        const candidates = document.querySelectorAll(selector);
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i].offsetHeight > 0 && candidates[i].offsetWidth > 0) {
                adSlot = candidates[i];
                console.log('Found ad using selector:', selector);
                break;
            }
        }
        if (adSlot) break;
    }
    
    // Second method: Look for "Sponsored" text inside elements
    if (!adSlot) {
        const sponsoredElements = Array.from(document.querySelectorAll('*')).filter(element => {
            const text = element.textContent;
            return text && (
                text.includes('Sponsored') || 
                text.includes('Try For Free') ||  // From your screenshot
                text.includes('Motion Teams') ||  // From your screenshot
                text.includes('usemotion.com') ||  // From your screenshot
                text.includes('Learn more') ||  // Common ad button text
                (text.includes('Ad') && element.tagName !== 'BODY' && 
                element.offsetHeight > 0 && 
                element.offsetWidth > 0)
            );
        });
        
        for (const element of sponsoredElements) {
            // Walk up to find a container element
            let container = element;
            for (let i = 0; i < 5; i++) { // Check up to 5 levels up
                if (!container.parentElement) break;
                container = container.parentElement;
                
                // Check if this is a good container candidate
                const rect = container.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 100) {
                    adSlot = container;
                    console.log('Found ad using sponsored text detection');
                    break;
                }
            }
            if (adSlot) break;
        }
    }
    
    // Find the top-level elements to guarantee placement at the very top
    const secondaryInnerTop = document.querySelector('#secondary-inner');
    const watchNextTop = document.querySelector('ytd-watch-next-secondary-results-renderer');
    
    // Find the recommended videos section specifically
    const recommendedVideos = document.querySelector('#items.ytd-watch-next-secondary-results-renderer');
    
    // Additional method: Look for the specific ad structure seen in the screenshot
    if (!adSlot) {
        // Find all elements that look like sponsored cards (trying to match the one in screenshot)
        const possibleAdCards = document.querySelectorAll('.ytd-watch-next-secondary-results-renderer');
        for (const card of possibleAdCards) {
            // Check if this looks like an ad card
            if (card.querySelector('a[href*="usemotion.com"]') || 
                card.querySelector('a[href*="sponsored"]') ||
                card.querySelector('span') && card.querySelector('span').textContent.includes('Sponsored') ||
                card.querySelector('img') && card.offsetHeight > 80) {
                
                adSlot = card;
                console.log('Found ad card that matches screenshot pattern');
                break;
            }
        }
    }
    
    // Debug what elements we found
    console.log('DOM Elements found:', {
        secondary: !!secondary,
        related: !!related,
        secondaryInner: !!secondaryInner,
        comments: !!comments,
        belowPlayer: !!belowPlayer,
        primary: !!primary,
        primaryInner: !!primaryInner,
        adSlot: !!adSlot,
        recommendedVideos: !!recommendedVideos,
        secondaryInnerTop: !!secondaryInnerTop,
        watchNextTop: !!watchNextTop
    });
    
    // Always have a fallback method that's guaranteed to work
    let insertionSuccessful = false;
    
    // Try each possible insertion point in order of preference for side placement
    try {
        // HIGHEST PRIORITY: Insert at the very top of the recommendations
        if (watchNextTop) {
            console.log('Adding summary to the very top of watch-next (above ALL content)');
            
            // Create a wrapper to match YouTube styling
            const wrapper = document.createElement('div');
            wrapper.style.margin = '0 0 16px 0';
            wrapper.style.padding = '0 8px';
            wrapper.appendChild(container);
            
            // Insert before the first child element to be at the absolute top
            watchNextTop.insertBefore(wrapper, watchNextTop.firstChild);
            
            // Style it to stand out but match YouTube's UI
            container.style.margin = '0';
            container.style.borderTop = '5px solid #065fd4';  // Blue top border to stand out
            
            insertionSuccessful = true;
        }
        // Second priority: Try to replace an ad if found
        else if (adSlot) {
            console.log('Replacing ad with summary!', adSlot);
            const adParent = adSlot.parentNode;
            
            // Get the ad's styles to match its position
            const adRect = adSlot.getBoundingClientRect();
            console.log('Ad dimensions:', adRect.width, 'x', adRect.height);
            
            // Make the container match the ad's width
            container.style.width = adRect.width + 'px';
            if (adRect.width > 0) {
                container.style.maxWidth = '100%';
            }
            
            // Place our container where the ad was
            adParent.insertBefore(container, adSlot);
            adSlot.style.display = 'none'; // Hide the ad
            
            // If we're in the secondary column, modify margins to fit better
            if (secondary && adParent.closest('#secondary')) {
                container.style.margin = '0 0 12px 0';
            }
            
            insertionSuccessful = true;
        }
        // Try to insert at the top of the secondary-inner element
        else if (secondaryInnerTop) {
            console.log('Adding summary to the very top of secondary-inner');
            secondaryInnerTop.insertBefore(container, secondaryInnerTop.firstChild);
            container.style.margin = '0 0 16px 0';
            insertionSuccessful = true;
        }
        // Try to insert directly into the recommended videos list
        else if (recommendedVideos) {
            console.log('Adding summary to the beginning of recommended videos');
            recommendedVideos.insertBefore(container, recommendedVideos.firstChild);
            container.style.margin = '0 8px 16px 8px';  // Match YouTube's spacing
            insertionSuccessful = true;
        }
        // Next try usual locations
        else if (secondary) {
            console.log('Adding summary to secondary column (side placement)');
            secondary.insertBefore(container, secondary.firstChild);
            insertionSuccessful = true;
        } else if (related) {
            console.log('Adding summary to related videos section');
            related.insertBefore(container, related.firstChild);
            insertionSuccessful = true;
        } else if (secondaryInner) {
            console.log('Adding summary to secondary-inner column');
            secondaryInner.insertBefore(container, secondaryInner.firstChild);
            insertionSuccessful = true;
        } else if (belowPlayer) {
            console.log('Adding summary below the player');
            belowPlayer.insertBefore(container, belowPlayer.firstChild);
            insertionSuccessful = true;
        } else if (primaryInner) {
            console.log('Adding summary to primary-inner section');
            primaryInner.appendChild(container);
            insertionSuccessful = true;
        } else if (primary) {
            console.log('Adding summary to primary section');
            primary.appendChild(container);
            insertionSuccessful = true;
        } else if (comments) {
            console.log('Adding summary before comments section');
            comments.parentNode.insertBefore(container, comments);
            insertionSuccessful = true;
        }
    } catch (e) {
        console.error('Error during insertion:', e);
        insertionSuccessful = false;
    }
    
    // Use different approach - DOM mutation to force top position
    if (!insertionSuccessful) {
        console.warn('Using observer-based insertion to ensure top position');
        
        // Set up a flag to track the insertion
        window.ytSummaryInserted = false;
        
        // Create a wrapper div with YouTube styling
        const wrapper = document.createElement('div');
        wrapper.style.margin = '0 0 16px 0';
        wrapper.style.padding = '0';
        wrapper.style.width = '100%';
        wrapper.appendChild(container);
        
        // Set up a special observer to find the best place to inject the summary
        const topInsertionObserver = new MutationObserver((mutations) => {
            // Only proceed if we haven't already inserted
            if (window.ytSummaryInserted) return;
            
            // Look for the elements we want to insert before
            const watchNext = document.querySelector('ytd-watch-next-secondary-results-renderer');
            const watchNextHeader = document.querySelector('ytd-watch-next-secondary-results-renderer #header');
            const secondaryInner = document.querySelector('#secondary-inner');
            
            // Try to insert at the very top, before any header
            if (watchNextHeader) {
                console.log('Observer: Found watch-next header to insert before');
                watchNext.insertBefore(wrapper, watchNextHeader);
                window.ytSummaryInserted = true;
                topInsertionObserver.disconnect();
            }
            // Otherwise try at the beginning of watchNext
            else if (watchNext && watchNext.firstChild) {
                console.log('Observer: Found watch-next to insert at beginning');
                watchNext.insertBefore(wrapper, watchNext.firstChild);
                window.ytSummaryInserted = true;
                topInsertionObserver.disconnect();
            }
            // Fallback to secondary-inner top
            else if (secondaryInner && secondaryInner.firstChild) {
                console.log('Observer: Inserting at top of secondary-inner');
                secondaryInner.insertBefore(wrapper, secondaryInner.firstChild);
                window.ytSummaryInserted = true;
                topInsertionObserver.disconnect();
            }
        });
        
        // Begin observing for the elements we want
        topInsertionObserver.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Proceed with normal insertion in the meantime
        if (secondary && secondary.firstChild) {
            secondary.insertBefore(wrapper.cloneNode(true), secondary.firstChild);
            insertionSuccessful = true;
        } else if (secondary) {
            secondary.appendChild(wrapper.cloneNode(true));
            insertionSuccessful = true;
        }
    }
    
    // Fallback to fixed positioning if all else fails or errors occur
    if (!insertionSuccessful) {
        console.warn('No insertion point worked, using fixed positioning');
        document.body.appendChild(container);
        container.style.position = 'fixed';
        container.style.top = '80px';
        container.style.right = '20px';
        container.style.width = '350px';
        container.style.maxHeight = '80vh';
        container.style.overflowY = 'auto';
        container.style.zIndex = '9999';
    }
    
    return container;
}

// Parse timestamp string to seconds
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

// Format the summary points
function formatSummaryPoints(summary) {
    try {
        console.log('Raw summary text:', summary);
        
        if (!summary || summary.trim() === '') {
            console.error('Summary is empty or blank');
            return `<div style="color: #ff6e6e; padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 4px;">Error: Received empty summary</div>`;
        }
        
        const points = summary.split('\n').filter(line => line.trim());
        console.log('Parsed points:', points);
        
        if (points.length === 0) {
            console.error('No points parsed from summary');
            return `<div style="color: #ff6e6e; padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 4px;">Error: No summary points found</div>`;
        }
        
        const isDarkMode = detectYouTubeDarkMode();
        const pointBgColor = isDarkMode ? '#2d2d2d' : '#ffffff';
        const pointBorderColor = isDarkMode ? '#383838' : '#efefef';
        const pointTextColor = isDarkMode ? '#aaa' : '#606060';
        const timestampColor = isDarkMode ? '#3ea6ff' : '#065fd4';
        
        let formattedPoints = '';
        let matchFound = false;
        
        for (const point of points) {
            // Try multiple formats that might be returned by the server
            let match = point.match(/Timestamp: \[(\d{2}:\d{2})\] - Key Point: (.*)/);
            
            if (!match) {
                // Try alternative format: "00:27 - Key Point: ..."
                match = point.match(/^(\d{2}:\d{2}) - Key Point: (.*)/);
            }
            
            if (!match) {
                // Try another alternative format: "[00:27] - ..."
                match = point.match(/\[(\d{2}:\d{2})\] - (.*)/);
            }
            
            if (match) {
                matchFound = true;
                const [_, timestamp, text] = match;
                formattedPoints += `
                    <div style="margin-bottom: 10px; padding: 10px; background: ${pointBgColor}; border-radius: 4px; border: 1px solid ${pointBorderColor};">
                        <span class="yt-summary-timestamp" data-timestamp="${timestamp}" 
                              style="color: ${timestampColor}; font-weight: 500; cursor: pointer; display: inline-block; margin-bottom: 6px;">
                            ${timestamp}
                        </span>
                        <div style="color: ${pointTextColor};">${text}</div>
                    </div>
                `;
            } else if (point.trim() !== '') {
                // For non-matching lines that aren't empty, show them as plain text
                formattedPoints += `<div style="margin-bottom: 10px; padding: 10px; background: ${pointBgColor}; border-radius: 4px; border: 1px solid ${pointBorderColor}; color: ${pointTextColor};">${point}</div>`;
            }
        }
        
        // If no matches were found, show the raw summary
        if (!matchFound) {
            console.warn('No timestamp formatting matches found in summary');
            const rawBgColor = isDarkMode ? '#2d2d2d' : '#f5f5f5';
            const rawTextColor = isDarkMode ? '#aaa' : '#606060';
            formattedPoints = `
                <div style="color: #ff6e6e; padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 4px; margin-bottom: 10px;">No formatted points found. Raw summary:</div>
                <pre style="white-space: pre-wrap; background: ${rawBgColor}; padding: 10px; font-family: monospace; font-size: 12px; color: ${rawTextColor};">${summary}</pre>
            `;
        }
        
        return formattedPoints;
    } catch (error) {
        console.error('Error formatting summary points:', error);
        return `
            <div style="color: #ff6e6e; padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 4px; margin-bottom: 10px;">Error formatting summary: ${error.message}</div>
            <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 10px; font-family: monospace; font-size: 12px;">${summary}</pre>
        `;
    }
}

// Fetch and display summary
async function fetchAndDisplaySummary() {
    const { videoId, videoUrl } = getCurrentVideoInfo();
    
    if (!videoId) {
        console.error('No video ID found');
        return;
    }

    // Remove old summary if it exists
    const oldContainer = document.querySelector('.yt-summary-container');
    if (oldContainer) {
        oldContainer.remove();
    }

    // Create new container
    const container = createSummaryContainer();
    
    // Ensure we have a content div
    if (!container) {
        console.error('Failed to create container');
        return;
    }
    
    const contentDiv = container.querySelector('.yt-summary-content');
    if (!contentDiv) {
        console.error('Cannot find .yt-summary-content element in container');
        return;
    }
    
    try {
        console.log('Fetching summary for video:', videoId);

        // Test server connection first (already done in checkServerStatus, but good to have as a pre-check if called independently)
        // For now, we assume checkServerStatus has already run.

        // Fetch summary from backend
        const response = await fetch(`${serverUrl}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ videoId: videoId })
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server response error:', errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('Received summary data:', data);
        
        if (!data.summary) {
            throw new Error('No summary data received from server');
        }

        // Log the full summary to console for debugging
        console.log('%c Full Summary From Server:', 'background: #3f51b5; color: white; padding: 4px;');
        console.log(data.summary);
        
        if (data.debug_info) {
            console.log('Debug info:', data.debug_info);
        }
        
        console.log('Setting innerHTML with formatted summary points');
        
        // Format and show the points with debug
        const formattedHTML = formatSummaryPoints(data.summary);
        console.log('Formatted HTML length:', formattedHTML.length);
        
        // Display the formatted summary
        contentDiv.innerHTML = `
            <div style="margin-bottom: 0;">
                ${formattedHTML}
            </div>
        `;
        
        // Force styles to be visible
        container.style.display = 'block';
        container.style.visibility = 'visible';
        contentDiv.style.display = 'block';
        contentDiv.style.visibility = 'visible';
        
        console.log('Summary content added to DOM');

        // Add click handlers for timestamps
        contentDiv.querySelectorAll('.yt-summary-timestamp').forEach(element => {
            element.addEventListener('click', () => {
                handleTimestampClick(element.dataset.timestamp);
            });
        });

        // Create and display notes section
        createNotesSection(contentDiv, videoId); // Pass contentDiv and videoId
        // Fetch and display existing notes
        const notesDisplayContainer = document.getElementById('video-notes-display');
        if (notesDisplayContainer) {
            fetchAndDisplayNotes(videoId, notesDisplayContainer);
        }

        // Log watched video
        logWatchedVideo(videoId);


    } catch (error) {
        console.error('Error in fetchAndDisplaySummary:', error);
        
        // Double-check that contentDiv exists before trying to access it
        if (contentDiv) {
            const isDarkMode = detectYouTubeDarkMode();
            const errorBgColor = isDarkMode ? 'rgba(255, 0, 0, 0.1)' : '#ffebee';
            const errorTextColor = isDarkMode ? '#ff6e6e' : '#cc0000';
            const buttonBgColor = isDarkMode ? '#3ea6ff' : '#065fd4';
            
            contentDiv.innerHTML = `
                <div style="color: ${errorTextColor}; padding: 12px; background: ${errorBgColor}; border-radius: 4px; margin-bottom: 10px;">
                    Error: ${error.message}
                    <br><br>
                    Please make sure:
                    <br>
                    1. The summary server is running (python server.py)
                    <br>
                    2. The server is using port 8000
                    <br>
                    3. The video has captions available
                    <br><br>
                    <button id="retry-summary" style="background: ${buttonBgColor}; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Retry Summary</button>
                </div>
            `;
            
            // Add retry button functionality
            document.getElementById('retry-summary')?.addEventListener('click', () => {
                fetchAndDisplaySummary();
            });
        } else {
            console.error('Cannot display error message: contentDiv is null');
            // Try to add error message to the container itself if available
            if (container) {
                container.innerHTML = `<div style="color: #ff6e6e; padding: 12px; background: rgba(255, 0, 0, 0.1); border-radius: 4px;">Error loading summary. Please refresh the page and try again.</div>`;
            }
            
            // Also add a floating notification as a fallback
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.top = '10px';
            notification.style.right = '10px';
            notification.style.backgroundColor = '#ffebee';
            notification.style.color = '#cc0000';
            notification.style.padding = '10px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '99999';
            notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            notification.innerHTML = `YouTube Summary Error: ${error.message}`;
            document.body.appendChild(notification);
            
            // Remove notification after 10 seconds
            setTimeout(() => {
                notification.remove();
            }, 10000);
        }
    }
}

// Initialize when the page is ready
function initializeSummary() {
    if (window.location.href.includes('youtube.com/watch')) {
        console.log('Initializing summary for YouTube video');
        
        // Reset our insertion flag
        window.ytSummaryInserted = false;
        
        // Show a notification to help locate the summary box
        const notificationHelper = document.createElement('div');
        notificationHelper.style.position = 'fixed';
        notificationHelper.style.top = '10px';
        notificationHelper.style.left = '10px';
        notificationHelper.style.backgroundColor = '#065fd4';
        notificationHelper.style.color = 'white';
        notificationHelper.style.padding = '10px';
        notificationHelper.style.borderRadius = '4px';
        notificationHelper.style.zIndex = '99999';
        notificationHelper.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notificationHelper.style.fontSize = '14px';
        notificationHelper.style.maxWidth = '300px';
        notificationHelper.innerHTML = 'YouTube Summary is loading... Look for the blue box at the TOP of recommended videos.';
        document.body.appendChild(notificationHelper);
        
        // Remove notification after 8 seconds
        setTimeout(() => {
            notificationHelper.remove();
        }, 8000);
        
        // Directly fetch and display summary
        fetchAndDisplaySummary();
    } else {
        console.log('Not on YouTube watch page, skipping summary');
    }
}

// Handle YouTube's SPA navigation
let lastUrl = location.href;
const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('YouTube navigation detected, URL changed');
        
        // Remove old summary if it exists
        const oldContainer = document.querySelector('.yt-summary-container');
        if (oldContainer) {
            oldContainer.remove();
        }
        
        // Only show summary on YouTube watch pages
        if (location.href.includes('youtube.com/watch')) {
            console.log('On YouTube watch page, fetching summary');
            fetchAndDisplaySummary();
        } else {
            console.log('Not on YouTube watch page, skipping summary');
        }
    }
});

// Start observing
observer.observe(document, { subtree: true, childList: true });

// Check if server is running
async function checkServerStatus() {
    try {
        // const serverUrl = 'http://127.0.0.1:8000'; // Already global
        const response = await fetch(`${serverUrl}/`);
        console.log('Server status check:', response.status);
        return response.ok;
    } catch (error) {
        console.error('Server status check failed:', error.message);
        return false;
    }
}

// Get or create user
function getOrCreateUser() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['clientGeneratedUserId'], async (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting clientGeneratedUserId from storage:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }

            if (result.clientGeneratedUserId) {
                clientGeneratedUserId = result.clientGeneratedUserId;
                console.log('Retrieved clientGeneratedUserId from storage:', clientGeneratedUserId);
            } else {
                clientGeneratedUserId = crypto.randomUUID();
                console.log('Generated new clientGeneratedUserId:', clientGeneratedUserId);
                chrome.storage.local.set({ clientGeneratedUserId: clientGeneratedUserId }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Error saving clientGeneratedUserId to storage:', chrome.runtime.lastError);
                        // Continue without rejecting, as we have an in-memory ID
                    } else {
                        console.log('Saved new clientGeneratedUserId to storage.');
                    }
                });
            }

            // Now call the backend
            try {
                const response = await fetch(`${serverUrl}/get_or_create_user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ client_generated_user_id: clientGeneratedUserId }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.user_id) {
                        databaseUserId = data.user_id;
                        console.log('User identified/created. Client ID:', clientGeneratedUserId, 'DB ID:', databaseUserId);
                        resolve(); // Resolve the promise when user identification is complete
                    } else {
                        console.error('Error: user_id not found in backend response', data);
                        reject('Error: user_id not found in backend response');
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Error calling /get_or_create_user:', response.status, errorText);
                    reject(`Server error: ${response.status} - ${errorText}`);
                }
            } catch (error) {
                console.error('Fetch error in getOrCreateUser:', error);
                reject(error);
            }
        });
    });
}


// Initialize on page load
console.log('YouTube Summary Extension loaded!');


// Function to create the notes section UI
function createNotesSection(parentContainer, videoId) {
    console.log('Creating notes section for video:', videoId);
    const isDarkMode = detectYouTubeDarkMode();

    const notesSectionContainer = document.createElement('div');
    notesSectionContainer.className = 'yt-notes-section';
    notesSectionContainer.style.marginTop = '20px';
    notesSectionContainer.style.paddingTop = '15px';
    notesSectionContainer.style.borderTop = `1px solid ${isDarkMode ? '#383838' : '#e5e5e5'}`;

    const heading = document.createElement('h3');
    heading.textContent = 'My Notes for this Video';
    heading.style.fontSize = '15px';
    heading.style.fontWeight = '500';
    heading.style.color = isDarkMode ? '#fff' : '#0f0f0f';
    heading.style.marginBottom = '10px';
    notesSectionContainer.appendChild(heading);

    const textarea = document.createElement('textarea');
    textarea.id = 'video-note-input';
    textarea.placeholder = 'Type your note here...';
    // Basic styling will be in styles.css, but some defaults here
    textarea.style.width = '100%';
    textarea.style.minHeight = '70px';
    textarea.style.marginBottom = '8px';
    textarea.style.padding = '8px';
    textarea.style.border = `1px solid ${isDarkMode ? '#555' : '#ccc'}`;
    textarea.style.borderRadius = '4px';
    textarea.style.backgroundColor = isDarkMode ? '#222' : '#fff';
    textarea.style.color = isDarkMode ? '#eee' : '#111';
    notesSectionContainer.appendChild(textarea);

    const saveButton = document.createElement('button');
    saveButton.id = 'save-video-note-btn';
    saveButton.textContent = 'Save Note';
    // Basic styling will be in styles.css
    saveButton.style.padding = '8px 12px';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '4px';
    saveButton.style.backgroundColor = isDarkMode ? '#3ea6ff' : '#065fd4';
    saveButton.style.color = 'white';
    saveButton.style.cursor = 'pointer';
    notesSectionContainer.appendChild(saveButton);
    
    const notesDisplay = document.createElement('div');
    notesDisplay.id = 'video-notes-display';
    notesDisplay.style.marginTop = '15px';
    notesSectionContainer.appendChild(notesDisplay);

    parentContainer.appendChild(notesSectionContainer);

    // Event Listener for Save Note button
    saveButton.addEventListener('click', async () => {
        const noteContent = textarea.value.trim();
        if (!noteContent) {
            alert('Note content cannot be empty.');
            return;
        }

        if (!databaseUserId) {
            console.error('Cannot save note: databaseUserId is not available.');
            alert('Error: User not identified. Cannot save note.');
            return;
        }
        if (!clientGeneratedUserId) {
             console.error('Cannot save note: clientGeneratedUserId is not available. This is needed for potential future authorization checks even if not directly used in this specific POST.');
            // alert('Error: Client user ID not available. Cannot save note.'); // Less critical for this specific endpoint but good to be aware
        }


        try {
            const response = await fetch(`${serverUrl}/users/${databaseUserId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    video_id: videoId,
                    content: noteContent,
                }),
            });

            if (response.status === 201) {
                textarea.value = ''; // Clear textarea
                console.log('Note saved successfully.');
                fetchAndDisplayNotes(videoId, notesDisplay); // Refresh notes display
                logWatchedVideo(videoId); // Log watched video after saving a note
            } else {
                const errorData = await response.json();
                console.error('Error saving note:', response.status, errorData);
                alert(`Error saving note: ${errorData.error || response.statusText}`);
            }
        } catch (error) {
            console.error('Fetch error while saving note:', error);
            alert('An unexpected error occurred while saving the note.');
        }
    });
}

// Function to fetch and display notes
async function fetchAndDisplayNotes(videoId, notesDisplayContainer) {
    if (!databaseUserId) {
        console.log('Cannot fetch notes: databaseUserId is not available.');
        notesDisplayContainer.innerHTML = '<p style="font-style: italic; color: #888;">User not identified. Notes cannot be loaded or saved.</p>';
        return;
    }

    console.log(`Fetching notes for video: ${videoId}, user: ${databaseUserId}`);
    try {
        const response = await fetch(`${serverUrl}/users/${databaseUserId}/notes_by_video/${videoId}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error fetching notes:', response.status, errorData);
            notesDisplayContainer.innerHTML = `<p style="color: #ff6e6e;">Error loading notes: ${errorData.error || response.statusText}</p>`;
            return;
        }

        const notes = await response.json();
        notesDisplayContainer.innerHTML = ''; // Clear previous notes

        if (notes.length === 0) {
            notesDisplayContainer.innerHTML = '<p style="font-style: italic; color: #888;">No notes for this video yet.</p>';
        } else {
            const isDarkMode = detectYouTubeDarkMode();
            notes.forEach(note => {
                const noteElement = document.createElement('div');
                noteElement.className = 'yt-individual-note';
                // Basic styling here, more in styles.css
                noteElement.style.padding = '8px';
                noteElement.style.border = `1px solid ${isDarkMode ? '#444' : '#ddd'}`;
                noteElement.style.marginBottom = '8px';
                noteElement.style.borderRadius = '4px';
                noteElement.style.backgroundColor = isDarkMode ? '#2b2b2b' : '#f9f9f9';
                noteElement.textContent = note.content; 
                // Later: Add created_at, edit/delete buttons
                notesDisplayContainer.appendChild(noteElement);
            });
        }
    } catch (error) {
        console.error('Fetch error while fetching notes:', error);
        notesDisplayContainer.innerHTML = '<p style="color: #ff6e6e;">An unexpected error occurred while fetching notes.</p>';
    }
}


// Check server status first and then initialize
checkServerStatus().then(async isServerRunning => { // Made this async
    if (isServerRunning) {
        console.log('Server is running, proceeding with user identification and extension initialization');
        try {
            await getOrCreateUser(); // Wait for user identification
            console.log('User identification successful. DB ID:', databaseUserId);
            // Proceed with initialization that depends on user ID
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeSummary);
            } else {
                initializeSummary();
            }
        } catch (error) {
            console.error('Failed to get or create user:', error);
            // Display a user-facing error message about user identification failure
            const notification = document.createElement('div');
            notification.style.position = 'fixed';
            notification.style.top = '10px';
            notification.style.right = '10px';
            notification.style.backgroundColor = '#ffebee'; // Red background for error
            notification.style.color = '#cc0000'; // Dark red text
            notification.style.padding = '10px';
            notification.style.borderRadius = '4px';
            notification.style.zIndex = '99999';
            notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            notification.innerHTML = `YouTube Summary: Could not identify user. Notes functionality may be affected. Error: ${error.message || error}`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 10000);
            // Decide if you want to initializeSummary or not if user identification fails.
            // For now, let's proceed with summary but notes will not work.
            // Or you could choose to not initializeSummary if user ID is critical for all features.
            if (document.readyState === 'loading') {
                 document.addEventListener('DOMContentLoaded', initializeSummary);
            } else {
                 initializeSummary();
            }
        }
    } else {
        console.warn('Server is not running, extension will not summarize videos');
        // Create a notification that the server is not running
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.top = '10px';
        notification.style.right = '10px';
        notification.style.backgroundColor = '#ffebee';
        notification.style.color = '#cc0000';
        notification.style.padding = '10px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '99999';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notification.innerHTML = 'YouTube Summary: Server is not running. Please start the server.';
        document.body.appendChild(notification);
        
        // Remove notification after 10 seconds
        setTimeout(() => {
            notification.remove();
        }, 10000);
    }
});
