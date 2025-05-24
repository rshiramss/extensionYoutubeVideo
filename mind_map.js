// Global variables
let clientGeneratedUserId = null;
let databaseUserId = null;
const serverUrl = 'http://127.0.0.1:8000'; // Ensure this matches your server configuration

// User Identification Logic
function getOrCreateUser() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['clientGeneratedUserId'], async (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting clientGeneratedUserId from storage:', chrome.runtime.lastError);
                displayError('Failed to retrieve user data from local storage.');
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
                        // Continue without rejecting, as we have an in-memory ID, but user might see an error if backend call fails
                    } else {
                        console.log('Saved new clientGeneratedUserId to storage.');
                    }
                });
            }

            try {
                const response = await fetch(`${serverUrl}/get_or_create_user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_generated_user_id: clientGeneratedUserId }),
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.user_id) {
                        databaseUserId = data.user_id;
                        console.log('User identified/created. Client ID:', clientGeneratedUserId, 'DB ID:', databaseUserId);
                        resolve();
                    } else {
                        console.error('Error: user_id not found in backend response', data);
                        displayError('User identification failed: No user ID from server.');
                        reject('Error: user_id not found in backend response');
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Error calling /get_or_create_user:', response.status, errorText);
                    displayError(`User identification failed: Server error ${response.status}.`);
                    reject(`Server error: ${response.status} - ${errorText}`);
                }
            } catch (error) {
                console.error('Fetch error in getOrCreateUser:', error);
                displayError('User identification failed: Network or fetch error.');
                reject(error);
            }
        });
    });
}

// Fetch Watched Videos Function
async function fetchWatchedVideos() {
    if (!databaseUserId) {
        console.error('Cannot fetch watched videos: databaseUserId is not available.');
        displayError('User not identified. Cannot fetch video history.');
        return null;
    }

    console.log('Fetching watched videos for user:', databaseUserId);
    try {
        const response = await fetch(`${serverUrl}/users/${databaseUserId}/watched_videos`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error fetching watched videos:', response.status, errorData);
            displayError(`Error loading video history: ${errorData.error || response.statusText}`);
            return null;
        }
        const videos = await response.json();
        console.log('Fetched watched videos:', videos);
        return videos;
    } catch (error) {
        console.error('Fetch error while fetching watched videos:', error);
        displayError('An unexpected error occurred while fetching video history.');
        return null;
    }
}

// Transform Data to Markdown for Markmap
function transformVideosToMarkdown(videos) {
    if (!videos || videos.length === 0) {
        return "# My Watched Videos\n- No videos watched yet.";
    }

    let markdown = "# My Watched Videos\n";
    videos.forEach(video => {
        const title = video.video_title || video.video_id; // Fallback to video_id if title is missing
        const videoUrl = `https://www.youtube.com/watch?v=${video.video_id}`;
        markdown += `## [${title} (ID: ${video.video_id})](${videoUrl})\n`;
        markdown += `### Watched: ${new Date(video.watched_at).toLocaleString()}\n`;
    });
    return markdown;
}

// Render Mind Map Function
function renderMindMap(markdownData) {
    const mindmapContainer = document.getElementById('mindmap-container');
    if (!mindmapContainer) {
        console.error('Error: #mindmap-container not found in the DOM for rendering.');
        return;
    }
    // Clear any previous messages or content
    mindmapContainer.innerHTML = ''; 

    try {
        const { Markmap, Transformer } = window.markmap;
        const transformer = new Transformer();
        const { root, features } = transformer.transform(markdownData);
        
        // Check if features like d3 are needed and loaded
        if (features && features.d3 && !window.d3) {
            console.error("D3 is required by Markmap but not loaded.");
            displayError("Markmap library (D3) is not loaded. Cannot render mind map.");
            return;
        }

        Markmap.create('#mindmap-container', null, root);
        console.log('Mind map rendered.');
    } catch(e) {
        console.error("Error rendering Markmap:", e);
        displayError("Failed to render the mind map. Please ensure Markmap libraries are correctly loaded.");
    }
}

// Helper to display messages in the container
function displayError(message) {
    const container = document.getElementById('mindmap-container');
    if (container) {
        // Using a more noticeable error display
        container.innerHTML = `<div class="message-overlay" style="color: red; border-color: red;">${message}</div>`;
    }
}

function displayMessage(message) {
     const container = document.getElementById('mindmap-container');
    if (container) {
        container.innerHTML = `<div class="message-overlay">${message}</div>`;
    }
}


// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    displayMessage('Initializing and identifying user...');
    try {
        await getOrCreateUser();
        displayMessage('Fetching your video history...');
        const videos = await fetchWatchedVideos();

        if (videos && videos.length > 0) {
            const markdown = transformVideosToMarkdown(videos);
            renderMindMap(markdown);
        } else if (videos) { // videos is an empty array
            console.log('No video history found.');
            displayMessage('No video history found to display.');
        } else { // videos is null (error occurred in fetchWatchedVideos)
            // Error message is already displayed by fetchWatchedVideos or getOrCreateUser
            console.log('Failed to load video history.');
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        // Error message is already displayed by getOrCreateUser
    }
});
