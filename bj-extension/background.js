// Bj Beyond Scanner — background service worker
// Syncs scans with the backend on Railway. Falls back silently if the API is unreachable.

const API = 'https://bj-beyond-scanner-production.up.railway.app';

function randomId(len = 24) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getAccount() {
    const { account } = await chrome.storage.local.get('account');
    if (account) return account;
    const created = { email: `anon_${randomId(8)}@scanner.bjbeyond`, password: randomId() };
    await chrome.storage.local.set({ account: created });
    return created;
}

// Backend keeps users in memory: on restart they disappear, so register again when needed.
async function ensureRemoteUser(force = false) {
    const account = await getAccount();
    if (account.userId && !force) return account.userId;

    let res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: account.password })
    });
    if (res.status === 401) {
        res = await fetch(`${API}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: account.email, password: account.password })
        });
    }
    if (!res.ok) throw new Error('auth failed: ' + res.status);
    const data = await res.json();
    account.userId = data.userId;
    account.plan = data.plan;
    await chrome.storage.local.set({ account });
    return data.userId;
}

async function recordScan(url, score) {
    const send = async (userId) => fetch(`${API}/api/scans/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, url, score: Math.round(score) })
    });

    let res = await send(await ensureRemoteUser());
    if (res.status === 401) res = await send(await ensureRemoteUser(true));
    if (res.status === 429) return { ok: false, limited: true };
    return { ok: res.ok };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'recordScan') {
        recordScan(msg.url, msg.score)
            .then(sendResponse)
            .catch(err => {
                console.warn('[BJ Scanner] backend offline:', err.message);
                sendResponse({ ok: false, offline: true });
            });
        return true; // async response
    }
});
