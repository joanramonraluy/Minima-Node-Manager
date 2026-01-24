// Helper function to add message to global log and keep only last 3 lines
let globalLogBuffer = [];

function addToGlobalLog(message) {
    const logInstances = document.querySelectorAll('.global-log-instance');

    // Add new message
    if (message && message.trim()) {
        globalLogBuffer.push(message.trim());
    }

    // Keep only last 3 lines
    if (globalLogBuffer.length > 3) {
        globalLogBuffer = globalLogBuffer.slice(-3);
    }

    const content = globalLogBuffer.join('\n');

    logInstances.forEach(log => {
        log.style.display = 'block'; // Ensure visible
        log.textContent = content;
        // Scroll to bottom
        log.scrollTop = log.scrollHeight;
    });
}
