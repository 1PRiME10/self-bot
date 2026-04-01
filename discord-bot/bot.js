const { Client } = require('discord.js-selfbot-v13');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const clients = new Map();
const GIST_FILENAME = 'discord-bot-tokens.json';
let gistId = null;

// ── GitHub Gist storage (persists across Render restarts) ──
async function getGistId() {
  if (gistId) return gistId;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) return null;

  // Search existing gists for our file
  const res = await fetch('https://api.github.com/gists', {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'discord-bot' }
  });
  const gists = await res.json();
  if (Array.isArray(gists)) {
    const found = gists.find(g => g.files[GIST_FILENAME]);
    if (found) { gistId = found.id; return gistId; }
  }

  // Create new private gist
  const create = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'discord-bot' },
    body: JSON.stringify({
      description: 'Discord bot tokens storage',
      public: false,
      files: { [GIST_FILENAME]: { content: '{}' } }
    })
  });
  const created = await create.json();
  gistId = created.id;
  console.log(`[GIST] Created new gist: ${gistId}`);
  return gistId;
}

async function loadTokens() {
  try {
    const id = await getGistId();
    if (!id) return {};
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'discord-bot' }
    });
    const gist = await res.json();
    return JSON.parse(gist.files[GIST_FILENAME].content || '{}');
  } catch { return {}; }
}

async function saveTokens(data) {
  try {
    const id = await getGistId();
    if (!id) return;
    await fetch(`https://api.github.com/gists/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'discord-bot' },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } })
    });
  } catch (e) { console.error('[GIST] Save failed:', e.message); }
}

// ── Discord client management ──
function startClient(token) {
  if (clients.has(token)) return;
  const client = new Client({ checkUpdate: false });

  client.on('ready', async () => {
    console.log(`[ON] ${client.user.username} is online!`);
    const data = await loadTokens();
    data[token] = { username: client.user.username, addedAt: data[token]?.addedAt || new Date().toISOString() };
    await saveTokens(data);
  });

  client.on('error', () => {});
  client.login(token).catch(() => clients.delete(token));
  clients.set(token, client);
}

function adminAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Access denied');
  }
  const [, password] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (password !== process.env.BOT_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Access denied');
  }
  next();
}

// ── Boot: load and start all saved tokens ──
(async () => {
  const savedTokens = await loadTokens();
  console.log(`[BOOT] Loading ${Object.keys(savedTokens).length} saved tokens...`);
  for (const token of Object.keys(savedTokens)) {
    startClient(token);
  }
})();

// ── Routes ──
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Discord Bot 24/7</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; background: #5865F2; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 16px; padding: 40px; max-width: 440px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    h1 { color: #5865F2; font-size: 24px; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
    input { width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 16px; outline: none; transition: border 0.2s; }
    input:focus { border-color: #5865F2; }
    button { width: 100%; padding: 13px; background: #5865F2; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
    button:hover { background: #4752C4; }
    .msg { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 14px; text-align: center; }
    .success { background: #d4edda; color: #155724; }
    .error { background: #f8d7da; color: #721c24; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Discord Bot 24/7</h1>
    <p>أضف توكنك وسيصبح بوتك أون لاين تلقائياً على مدار الساعة.<br>
    Add your token and your bot will be online 24/7.</p>
    <form method="POST" action="/add">
      <input type="password" name="token" placeholder="Discord Token" required />
      <button type="submit">تفعيل / Activate</button>
    </form>
    ${req.query.success ? '<div class="msg success">✅ Bot activated successfully!</div>' : ''}
    ${req.query.error ? `<div class="msg error">❌ ${req.query.error}</div>` : ''}
    ${req.query.removed ? '<div class="msg success">✅ Bot removed successfully!</div>' : ''}
  </div>
</body>
</html>`);
});

app.post('/add', async (req, res) => {
  const token = (req.body.token || '').trim();
  if (!token) return res.redirect('/?error=Token+is+required');
  if (clients.has(token)) return res.redirect('/?error=Token+already+active');

  try {
    const check = await fetch('https://discord.com/api/v9/users/@me', {
      headers: { Authorization: token }
    });
    if (!check.ok) return res.redirect('/?error=Invalid+token');
    startClient(token);
    res.redirect('/?success=1');
  } catch {
    res.redirect('/?error=Invalid+token');
  }
});

app.post('/remove', async (req, res) => {
  const token = (req.body.token || '').trim();
  if (!token) return res.redirect('/?error=Token+required');
  const client = clients.get(token);
  if (client) { try { client.destroy(); } catch {} clients.delete(token); }
  const data = await loadTokens();
  delete data[token];
  await saveTokens(data);
  res.redirect('/?removed=1');
});

app.post('/admin/remove', adminAuth, async (req, res) => {
  const token = (req.body.token || '').trim();
  if (!token) return res.redirect('/admin');
  const client = clients.get(token);
  if (client) { try { client.destroy(); } catch {} clients.delete(token); }
  const data = await loadTokens();
  delete data[token];
  await saveTokens(data);
  res.redirect('/admin');
});

app.get('/admin', adminAuth, async (req, res) => {
  const gistData = await loadTokens();

  // Merge Gist data with in-memory clients so nothing is hidden
  const data = { ...gistData };
  for (const [tok, client] of clients.entries()) {
    if (!data[tok]) {
      data[tok] = {
        username: client.user?.username || 'Unknown',
        addedAt: new Date().toISOString()
      };
    }
  }

  const rows = Object.entries(data).map(([tok, info]) => {
    const c = clients.get(tok);
    const online = c?.isReady() ? '🟢 Online' : '🔴 Offline';
    const masked = tok.slice(0, 10) + '••••••••••••';
    return `<tr>
      <td>${info.username || 'Unknown'}</td>
      <td><code>${masked}</code></td>
      <td>${online}</td>
      <td>${new Date(info.addedAt).toLocaleString()}</td>
      <td>
        <form method="POST" action="/admin/remove" style="margin:0">
          <input type="hidden" name="token" value="${tok}" />
          <button type="submit" onclick="return confirm('Remove this bot?')" style="background:#e74c3c;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;">Remove</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin Dashboard</title>
  <style>
    body { font-family: sans-serif; background: #f4f6f8; padding: 30px; }
    h1 { color: #5865F2; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    th { background: #5865F2; color: white; padding: 12px 16px; text-align: left; }
    td { padding: 12px 16px; border-bottom: 1px solid #eee; }
    .count { background: white; padding: 16px 20px; border-radius: 10px; display: inline-block; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <h1>🛡 Admin Dashboard</h1>
  <div class="count">Total Bots: <strong>${Object.keys(data).length}</strong></div>
  <table>
    <thead><tr><th>Username</th><th>Token</th><th>Status</th><th>Added At</th><th>Action</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999">No bots yet</td></tr>'}</tbody>
  </table>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
