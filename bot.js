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
  console.log("I'm Ready To Work 24/7 on port " + PORT);
});
app.get('/', (req, res) => {
  res.send(`
  <body>
  <center><h1>Bot 24H ON!</h1></center>
  </body>`)
});

client.on('ready', async () => {
  console.log(`${client.user.username} is Ready For Working 24/7!`);
})

client.login(process.env.token);
