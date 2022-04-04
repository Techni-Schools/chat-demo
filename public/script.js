class Application {
  constructor() {
    this.user = {chats: {}};
    this.chat = new Chat(this.user);
  }
}

class Chat {
  constructor(user) {
    this.user = user;
  }

  async init() {
    await this.getMe();
    await this.loadUsers();
    this.openWebSocket();
  }

  async loadUsers() {
    return fetch('/user/list')
        .then(response => {
          return response.json();
        })
        .then(response => {
          document.getElementById('user_list').innerHTML = _.reduce(response, (list, el) => {
            if (el.name !== this.user.name) {
              return list += `<li class='list-group-item'><span class="label">${el.name}</span> <button class="btn text-primary" type="button" onclick="app.chat.initiateChatWith('${el.name}')"><i class="bi bi-chat"></i></button></li>`;
            } else {
              return list;
            }
          }, '')
        });
  }

  async getMe() {
    return fetch('/user')
        .then(response => {
          if (response.status !== 200) {
            throw {status: response.status, statusText: response.statusText};
          }
          return response.json();
        })
        .then(response => {
          this.user.name = response.name;
          document.getElementById("me").innerText = this.user.name;
        })
        .catch(reason => {
          if (reason.status === 401) {
            window.location = '/users.html';
          } else if (reason.status === 409) {
            alert(reason.statusText);
          }
        })
  }

  initiateChatWith(user) {
    return fetch('/user/chat-with', {
      method: 'POST', headers: {
        'Content-Type': 'application/json'
      }, body: JSON.stringify({user})
    }).then(response => {
      return response.json();
    }).then(response => {
      this.startChat(response);
    })
  }

  openWebSocket() {
    this.ws = new WebSocket(`ws${window.location.protocol == 'https:' ? 's' : ''}://${window.location.host}/chat`)

    this.ws.onopen = () => {
      console.log('ws opened');
    }

    this.ws.onmessage = (message) => {
      const msg = JSON.parse(message.data);
      if (msg.type === 'USER.JOIN' || msg.type === 'USER.LEFT') {
        this.loadUsers();
      }

      if (msg.type === 'USER.CHAT') {
        if (confirm(`Do you want to chat with ${msg.data.from} ?`)) {
          this.startChat(msg.data);
        } else {
          this.declineChat(msg.data);
        }
      }

      if (msg.type === 'CHAT.MESSAGE') {
        this.addMessageToChat(msg.data);
      }
      if (msg.type === 'CHAT.DECLINE' || msg.type === 'CHAT.END') {
        this.addSystemMessageToChat(msg.data);
      }
    }
  }

  startChat(data) {
    this.user.chats[data.id] = data.from;
    document.getElementById("chats-container").insertAdjacentHTML('beforeend', this.getNewChatWindow(data));
  }

  getNewChatWindow(data) {
    return `
    <div class="chat-window card shadow" id="chat-${data.id}" xmlns="http://www.w3.org/1999/html">
      <div class="card-header"><span class="chat-title">${data.from}</span><button type="button" class="btn" onclick="app.chat.closeChat(${data.id})"><i class="bi bi-x-lg"></i></button> </div>
      <div class="card-body" >
        <ul class="chat-messages p-1 mb-3 rounded shadow-sm">
      
        </ul>
        <div class="chat-controls">
          <input type="text" id="chat-input-${data.id}" class="form-control" onkeyup="app.chat.enter(event,${data.id})"/>
          <button type="button" id="chat-send-btn-${data.id}" onclick="app.chat.sendMessage(${data.id})" class="btn"><i class="bi bi-send"></i></button>
        </div>
      </div>
    </div>
    `;
  }

  enter(event, chatId) {
    if (event.keyCode === 13) {
      event.preventDefault();
      document.getElementById(`chat-send-btn-${chatId}`).click();
    }
  }

  sendMessage(chatId) {
    const text = document.getElementById('chat-input-' + chatId).value;

    this.ws.send(JSON.stringify({
      type: 'CHAT.MESSAGE',
      data: {text: text, to: this.user.chats[chatId], from: this.user.name, id: chatId}
    }));
    document.querySelector(`#chat-${chatId} .chat-messages`).insertAdjacentHTML('beforeend', `<li class="msg msg-sent">${text}</li>`)
    document.getElementById('chat-input-' + chatId).value = '';
  }

  addMessageToChat(data) {
    document.querySelector(`#chat-${data.id} .chat-messages`).insertAdjacentHTML('beforeend', `<li class="msg msg-received">${data.text}</li>`)
  }

  addSystemMessageToChat(data) {
    document.querySelector(`#chat-${data.id} .chat-messages`).insertAdjacentHTML('beforeend', `<li class="msg msg-system">${data.text}</li>`)
  }

  declineChat(data) {
    this.ws.send(JSON.stringify({
      type: 'CHAT.DECLINE',
      data: {text: 'User declined chat', to: data.from, from: this.user.name, id: data.id}
    }));
  }

  closeChat(chatId) {
    this.ws.send(JSON.stringify({
      type: 'CHAT.END',
      data: {text: 'User closed the chat', to: this.user.chats[chatId], from: this.user.name, id: chatId}
    }));
    document.querySelector(`#chat-${chatId}`).remove();
  }
}

const app = new Application();
