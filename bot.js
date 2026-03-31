const { Client } = require('discord.js-selfbot-v13');
const client = new Client({checkUpdate:false}); 
const express = require("express")
const app = express();

function basicAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Bot Status"');
    return res.status(401).send('Access denied');
  }
  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const [, password] = credentials.split(':');
  if (password !== process.env.BOT_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="Bot Status"');
    return res.status(401).send('Access denied');
  }
  next();
}

app.use(basicAuth);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Your app is listening on port ' + PORT);
});

app.get('/', (req, res) => {
  const online = client.isReady();
  const username = client.user?.username ?? null;
  res.send(`
    <body style="font-family:sans-serif;text-align:center;padding:60px">
      <h1>${online ? 'Bot 24H ON!' : 'Bot Offline'}</h1>
      ${username ? `<p>Logged in as <strong>${username}</strong></p>` : ''}
    </body>
  `);
});

client.on('ready', async () => {
  console.log(`${client.user.username} is Ready For Working 24/7!`);
});

client.login(process.env.token);
