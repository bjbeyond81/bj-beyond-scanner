console.log('[BJ Scanner] Content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[BJ Scanner] Message received:', message);
    
    if (message.action === 'getPageContent') {
        const pageData = {
            html: document.documentElement.outerHTML,
            title: document.title,
            url: window.location.href,
            text: document.body.innerText
        };
        console.log('[BJ Scanner] Sending page data');
        sendResponse(pageData);
    }
});
