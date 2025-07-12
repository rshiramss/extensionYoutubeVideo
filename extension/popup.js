document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    
    try {
        // Check if server is running
        const response = await fetch('http://127.0.0.1:8000/');
        
        if (response.ok) {
            statusDiv.textContent = '✓ Server is running';
            statusDiv.className = 'status success';
        } else {
            throw new Error('Server not responding');
        }
    } catch (error) {
        statusDiv.textContent = '✗ Server is offline';
        statusDiv.className = 'status error';
        console.error('Server check failed:', error);
    }
});