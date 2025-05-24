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

            // Now call the backend to get the databaseUserId
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
                        resolve();
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

// Fetch and Display All Notes Logic
async function fetchAllNotes() {
    const notesContainer = document.getElementById('all-notes-container');
    if (!notesContainer) {
        console.error('Error: #all-notes-container not found in the DOM.');
        return;
    }

    if (!databaseUserId) {
        notesContainer.innerHTML = '<p class="error-message">Error: User not identified. Cannot fetch notes.</p>';
        console.error('Cannot fetch notes: databaseUserId is not available.');
        return;
    }

    try {
        const response = await fetch(`${serverUrl}/users/${databaseUserId}/notes`);
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error fetching all notes:', response.status, errorData);
            notesContainer.innerHTML = `<p class="error-message">Error loading notes: ${errorData.error || response.statusText}</p>`;
            return;
        }

        const notes = await response.json();
        notesContainer.innerHTML = ''; // Clear "Loading notes..." or previous content

        if (notes.length === 0) {
            notesContainer.innerHTML = '<p>You haven\'t saved any notes yet.</p>';
            return;
        }

        notes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'note-item';

            const content = document.createElement('p');
            content.className = 'note-content';
            content.textContent = note.content;
            noteItem.appendChild(content);

            const videoLink = document.createElement('p');
            videoLink.className = 'note-video';
            videoLink.innerHTML = `Video: <a href="https://www.youtube.com/watch?v=${note.video_id}" target="_blank">https://www.youtube.com/watch?v=${note.video_id}</a>`;
            noteItem.appendChild(videoLink);
            
            const timestamps = document.createElement('p');
            timestamps.className = 'note-timestamps';
            timestamps.textContent = `Created: ${new Date(note.created_at).toLocaleString()} | Updated: ${new Date(note.updated_at).toLocaleString()}`;
            noteItem.appendChild(timestamps);

            notesContainer.appendChild(noteItem);
        });

    } catch (error) {
        console.error('Fetch error while fetching all notes:', error);
        notesContainer.innerHTML = '<p class="error-message">An unexpected error occurred while fetching your notes.</p>';
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await getOrCreateUser();
        await fetchAllNotes(); // Changed to await as well, though fetchAllNotes is already async
    } catch (error) {
        console.error('Initialization failed:', error);
        const notesContainer = document.getElementById('all-notes-container');
        if (notesContainer) {
            notesContainer.innerHTML = `<p class="error-message">Could not initialize the page: ${error.message || error}. Please try refreshing.</p>`;
        }
    }
});
