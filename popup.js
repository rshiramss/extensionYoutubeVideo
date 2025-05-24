document.addEventListener('DOMContentLoaded', () => {
    const viewAllNotesBtn = document.getElementById('viewAllNotesBtn');

    if (viewAllNotesBtn) {
        viewAllNotesBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('all_notes.html') });
        });
    } else {
        console.error('Button with ID "viewAllNotesBtn" not found in popup.html');
    }

    const viewMindMapBtn = document.getElementById('viewMindMapBtn');
    if (viewMindMapBtn) {
        viewMindMapBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('mind_map.html') });
        });
    } else {
        console.error('Button with ID "viewMindMapBtn" not found in popup.html');
    }
});
