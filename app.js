const express = require('express')
const session = require('express-session')
const ws = require('ws');
const http = require('http');
const _ = require('lodash');
const app = express()
const users = [];
let i = 0;

app.use(express.static('public'))
const sessionParser = session({
  secret: 'secureToken',
  resave: false,
  saveUninitialized: false
});

app.use(sessionParser);
app.use(express.json())
app.use(express.urlencoded({extended: false}))

const server = http.createServer(app);
const wss = new ws.WebSocket.Server({clientTracking: true, noServer: true});

server.on('upgrade', function(request, socket, head) {

  sessionParser(request, {}, () => {
    if (!request.session.user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (request.url === '/chat') {
      wss.handleUpgrade(request, socket, head, function(ws) {
        wss.emit('connection', ws, request);
      });
    }
  });
});

app.get('/test', (req, res) => {
  res.send('hello world')
})

app.post('/user/register', (req, res) => {
  if (users[req.body.user_name]) {
    res.status(409).send('User already exists');
  } else {
    req.session.user = req.body.user_name
    users[req.session.user] = {chats: [], name: req.session.user};

    res.redirect(301, '/chat.html')
  }
})

app.get('/user/list', (req, res) => {
  res.json(_.compact(_.values(users)));
})

app.get('/user', (req, res) => {
  const user = req.session.user
  if (req.session.user) {
    res.json({name: user, chats: users[user].chats});
  } else {
    res.sendStatus(401)
  }
})

app.post('/user/chat-with', (req, res) => {
  users[req.session.user].chats.push(req.body.user);
  const chatId = i++;
  wss.clients.forEach(client => {
    if (client.user === req.body.user) {
      client.send(JSON.stringify({type: 'USER.CHAT', data: {from: req.session.user, to: client.user, id: chatId}}))
    }
  });
  res.json({to: req.session.user, from: req.body.user, id: chatId});
})

wss.on('connection', function(ws, req) {
  ws.user = req.session.user;

  wss.clients.forEach(client => {
    if (client !== ws) {
      client.send(JSON.stringify({type: 'USER.JOIN', data: req.session.user}))
    }
  });

  ws.on('close', () => {
    delete users[ws.user];
    wss.clients.forEach(client => {
      if (client !== ws) {
        client.send(JSON.stringify({type: 'USER.LEFT', data: req.session.user}))
      }
    });
  })

  ws.on('message', function(msg) {
    const message = JSON.parse(msg);
    if (message.type === 'CHAT.MESSAGE' || message.type === 'CHAT.DECLINE' || message.type === 'CHAT.END') {
      wss.clients.forEach(client => {
        if (client.user === message.data.to) {
          client.send(JSON.stringify({type: message.type, data: message.data}))
        }
      });
    }
  });
});

server.listen(process.env.PORT || 3000, function() {
  console.log('Listening');
});
