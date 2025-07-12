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

// Fetch Mind Map Data Function (renamed and updated)
async function fetchMindMapData() {
    if (!databaseUserId) {
        console.error('Cannot fetch mind map data: databaseUserId is not available.');
        displayError('User not identified. Cannot fetch mind map data.');
        return null;
    }

    console.log('Fetching mind map data for user:', databaseUserId);
    try {
        const response = await fetch(`${serverUrl}/users/${databaseUserId}/mind_map_data`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error fetching mind map data:', response.status, errorData);
            displayError(`Error loading mind map data: ${errorData.error || response.statusText}`);
            return null;
        }
        const mindMapData = await response.json();
        console.log('Fetched mind map data:', mindMapData);
        return mindMapData; // Expects {"videos": [...], "all_notes_keywords": [...]}
    } catch (error) {
        console.error('Fetch error while fetching mind map data:', error);
        displayError('An unexpected error occurred while fetching mind map data.');
        return null;
    }
}

// Transform Data to Markdown for Markmap (renamed and updated)
function transformMindMapDataToMarkdown(data) {
    let markdown = "";

    // Videos Section
    if (data && data.videos && data.videos.length > 0) {
        markdown += "# My Watched Videos\n";
        data.videos.forEach(video => {
            const title = video.video_title || video.video_id; // Fallback to video_id if title is missing
            const videoUrl = `https://www.youtube.com/watch?v=${video.video_id}`;
            markdown += `## [${title} (ID: ${video.video_id})](${videoUrl})\n`;
            markdown += `### Watched: ${new Date(video.watched_at).toLocaleString()}\n`;
        });
    } else {
        markdown += "# My Watched Videos\n- No videos watched yet.\n";
    }

    // Keywords Section
    if (data && data.all_notes_keywords && data.all_notes_keywords.length > 0) {
        markdown += "\n# Common Keywords from Notes\n"; // Add a newline for separation
        data.all_notes_keywords.forEach(keyword => {
            markdown += `## ${keyword}\n`;
        });
    }
    
    // If both are empty or data is null, Markmap will handle an empty string,
    // or we can return a specific message.
    // For now, if both are empty, the videos section will show "No videos watched yet."
    // and keywords section will be absent.

    return markdown.trim() === "" ? "# Mind Map\n- No data available." : markdown;
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

    // Library loading checks
    if (typeof window.d3 === 'undefined') {
        console.error('D3.js library not loaded.');
        displayError('Error: D3.js library could not be loaded. Mind map cannot be rendered. Please check your internet connection and ensure content security policies are not blocking cdn.jsdelivr.net.');
        return;
    }
    if (typeof window.markmap === 'undefined' ||
        typeof window.markmap.Markmap === 'undefined' ||
        typeof window.markmap.Transformer === 'undefined') {
        console.error('Markmap libraries not loaded properly.');
        displayError('Error: Markmap libraries could not be loaded. Mind map cannot be rendered. Please check your internet connection and ensure content security policies are not blocking cdn.jsdelivr.net.');
        return;
    }

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
        displayMessage('Fetching data for your mind map...');
        const mindMapData = await fetchMindMapData();

        if (mindMapData) {
            // Check if there's any actual data to display
            const hasVideos = mindMapData.videos && mindMapData.videos.length > 0;
            const hasKeywords = mindMapData.all_notes_keywords && mindMapData.all_notes_keywords.length > 0;

            if (hasVideos || hasKeywords) {
                const markdown = transformMindMapDataToMarkdown(mindMapData);
                renderMindMap(markdown);
            } else {
                console.log('No videos or keywords found for the mind map.');
                displayMessage('No data available to display in the mind map (no videos or keywords found).');
            }
        } else { 
            // Error message is already displayed by fetchMindMapData or getOrCreateUser
            console.log('Failed to load mind map data.');
            // displayError('Could not load data for the mind map.'); // Redundant if fetchMindMapData shows error
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        // Error message is likely already displayed by getOrCreateUser
    }
});
