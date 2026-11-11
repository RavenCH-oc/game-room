// 和伺服器的即時連線。斷掉會自動重連。

import type { ClientMessage, ServerMessage } from '../../server/protocol.ts';

export interface Connection {
  send(message: ClientMessage): void;
}

export function connect(handlers: {
  onOpen: () => void;
  onMessage: (message: ServerMessage) => void;
  onClose: () => void;
}): Connection {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;
  let socket: WebSocket;

  const open = (): void => {
    socket = new WebSocket(url);
    socket.addEventListener('open', handlers.onOpen);
    socket.addEventListener('message', (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch (error) {
        console.error('看不懂伺服器的訊息', error);
      }
    });
    socket.addEventListener('close', () => {
      handlers.onClose();
      setTimeout(open, 1500);
    });
  };
  open();

  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
  };
}
