const FREE_LIMIT = 5;
const $ = id => document.getElementById(id);
let lastReport = null;

const color = s => (s > 70 ? '#4CAF50' : s > 40 ? '#FFC107' : '#F44336');

function show(section) {
    for (const id of ['start', 'loading', 'results']) $(id).hidden = id !== section;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function getUsage() {
    const today = new Date().toDateString();
    const { scanCount = 0, scanDate } = await chrome.storage.local.get(['scanCount', 'scanDate']);
    if (scanDate !== today) {
        await chrome.storage.local.set({ scanCount: 0, scanDate: today });
        return 0;
    }
    return scanCount;
}

async function updateScansLeft() {
    const used = await getUsage();
    $('scans-left').innerText = `${Math.max(0, FREE_LIMIT - used)} scan gratuiti rimasti oggi`;
    return used;
}

// Reads the page directly via activeTab + scripting (works on tabs opened before install)
async function getPageData(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
            html: document.documentElement.outerHTML,
            title: document.title,
            url: location.href,
            text: document.body ? document.body.innerText : ''
        })
    });
    return result;
}

async function scan() {
    $('error').innerText = '';
    const used = await getUsage();
    if (used >= FREE_LIMIT) {
        $('error').innerText = `Limite giornaliero raggiunto (${FREE_LIMIT} scan). Passa a Pro per scan illimitati.`;
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || '')) {
        $('error').innerText = 'Apri un sito web (http/https) per analizzarlo.';
        return;
    }

    show('loading');
    try {
        const page = await getPageData(tab.id);
        const analysis = new WebsiteAnalyzer().analyze(page);
        lastReport = { url: page.url, title: page.title, date: new Date().toISOString(), ...analysis };
        showResults(analysis);

        await chrome.storage.local.set({ scanCount: used + 1 });
        chrome.runtime.sendMessage({ action: 'recordScan', url: page.url, score: analysis.score }, res => {
            if (chrome.runtime.lastError) return;
            if (res && res.limited) chrome.storage.local.set({ scanCount: FREE_LIMIT });
        });
    } catch (err) {
        console.error('[BJ Scanner]', err);
        show('start');
        $('error').innerText = 'Impossibile analizzare questa pagina: ' + err.message;
    }
}

function showResults(analysis) {
    show('results');
    const main = $('main-score');
    main.innerText = Math.round(analysis.score);
    main.style.color = color(analysis.score);
    $('platform').innerText = analysis.platform ? `Piattaforma: ${analysis.platform}` : '';

    for (const [cat, score] of Object.entries(analysis.scores)) {
        const bar = $(cat + '-bar');
        if (bar) { bar.style.width = score + '%'; bar.style.backgroundColor = color(score); }
        const label = $(cat + '-score');
        if (label) label.innerText = Math.round(score);
    }

    const box = $('opportunities');
    box.innerHTML = '';
    if (!analysis.opportunities.length) {
        box.innerHTML = '<p class="muted">Nessuna criticità trovata.</p>';
        return;
    }
    for (const opp of analysis.opportunities) {
        const div = document.createElement('div');
        div.className = 'opportunity ' + opp.impact;
        div.innerHTML = `<strong>${escapeHtml(opp.title)}<span class="tag">${escapeHtml(opp.category)}</span></strong><p>${escapeHtml(opp.description)}</p>`;
        box.appendChild(div);
    }
}

function exportReport() {
    if (!lastReport) return;
    const r = lastReport;
    const lines = [
        `BJ BEYOND SCANNER — REPORT`,
        `Sito: ${r.url}`,
        `Data: ${new Date(r.date).toLocaleString('it-IT')}`,
        r.platform ? `Piattaforma: ${r.platform}` : '',
        ``,
        `PUNTEGGIO TOTALE: ${Math.round(r.score)}/100`,
        ...Object.entries(r.scores).map(([k, v]) => `- ${k.toUpperCase()}: ${Math.round(v)}/100`),
        ``,
        `OPPORTUNITÀ (${r.opportunities.length})`,
        ...r.opportunities.map((o, i) => `${i + 1}. [${o.impact.toUpperCase()}] ${o.title}\n   ${o.description}`)
    ].filter(l => l !== null);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scan-${new URL(r.url).hostname}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) { try { $('site').innerText = new URL(tab.url).hostname; } catch (_) {} }
    await updateScansLeft();
    show('start');
    $('scan-btn').addEventListener('click', scan);
    $('export-btn').addEventListener('click', exportReport);
});
