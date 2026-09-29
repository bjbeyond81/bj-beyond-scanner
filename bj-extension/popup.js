async function main() {
    const userId = await ensureUser();
    
    document.getElementById('scan-btn').addEventListener('click', async () => {
        const canScan = await checkScanLimit(userId);
        if (!canScan) {
            document.getElementById('error').innerText = 'Daily limit reached (5 scans). Upgrade to Pro!';
            return;
        }
        
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getPageContent'}, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[BJ Scanner] Error:', chrome.runtime.lastError);
                    document.getElementById('error').innerText = 'Error: ' + chrome.runtime.lastError.message;
                    return;
                }
                
                const analyzer = new WebsiteAnalyzer();
                const analysis = analyzer.analyze(response);
                showResults(analysis, userId);
                recordScan(userId);
            });
        });
    });
}

async function ensureUser() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userId'], (result) => {
            if (result.userId) {
                resolve(result.userId);
            } else {
                const userId = 'user_' + Date.now();
                chrome.storage.local.set({userId, scanCount: 0, scanDate: new Date().toDateString()}, () => {
                    resolve(userId);
                });
            }
        });
    });
}

async function checkScanLimit(userId) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['scanCount', 'scanDate'], (result) => {
            const today = new Date().toDateString();
            if (result.scanDate !== today) {
                chrome.storage.local.set({scanCount: 0, scanDate: today}, () => resolve(true));
            } else {
                resolve((result.scanCount || 0) < 5);
            }
        });
    });
}

function recordScan(userId) {
    chrome.storage.local.get(['scanCount'], (result) => {
        const count = (result.scanCount || 0) + 1;
        chrome.storage.local.set({scanCount: count});
        chrome.runtime.sendMessage({action: 'recordScan', userId});
    });
}

function showResults(analysis, userId) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('results').style.display = 'block';
    
    const mainScore = document.getElementById('main-score');
    mainScore.innerText = Math.round(analysis.score);
    mainScore.style.color = analysis.score > 70 ? '#4CAF50' : analysis.score > 40 ? '#FFC107' : '#F44336';
    
    Object.keys(analysis.scores).forEach(category => {
        const score = analysis.scores[category];
        const el = document.getElementById(category + '-bar');
        if (el) {
            el.style.width = score + '%';
            el.style.backgroundColor = score > 70 ? '#4CAF50' : score > 40 ? '#FFC107' : '#F44336';
        }
        const labelEl = document.getElementById(category + '-score');
        if (labelEl) labelEl.innerText = Math.round(score);
    });
    
    const oppDiv = document.getElementById('opportunities');
    oppDiv.innerHTML = '';
    analysis.opportunities.forEach(opp => {
        const div = document.createElement('div');
        div.className = 'opportunity';
        div.innerHTML = `<strong>${opp.title}</strong><p>${opp.description}</p>`;
        oppDiv.appendChild(div);
    });
}

document.addEventListener('DOMContentLoaded', main);
