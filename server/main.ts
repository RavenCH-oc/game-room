// 伺服器入口：只開一個連接埠，同時負責
//   1. 把網頁檔案送給瀏覽器
//   2. 即時連線（WebSocket，路徑 /ws）
//
// 用法：
//   node server/main.ts --dev   開發模式（網頁由 Vite 即時編譯，改程式會自動更新）
//   node server/main.ts         正式模式（送出 npm run build 打包好的 web/dist）

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER_CONFIG } from './config.ts';
import { RoomManager } from './roomManager.ts';
import { serveStaticFile } from './staticFiles.ts';

const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || SERVER_CONFIG.port;
const distDir = fileURLToPath(new URL('../web/dist', import.meta.url));

type Handler = (request: IncomingMessage, response: ServerResponse) => void;
let handleHttp: Handler = (request, response) => serveStaticFile(distDir, request, response);

const httpServer = createServer((request, response) => handleHttp(request, response));

if (isDev) {
  // 開發模式才載入 Vite（正式模式不需要）
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../web', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: 'spa',
  });
  handleHttp = (request, response) => vite.middlewares(request, response);
}

// ───────── 即時連線 ─────────

const rooms = new RoomManager();
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

httpServer.on('upgrade', (request, socket, head) => {
  // 只接手 /ws；其他（例如 Vite 的自動更新連線）交給別人處理
  if (request.url !== '/ws') return;
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    onConnection(webSocket);
  });
});

function onConnection(webSocket: WebSocket): void {
  const id = randomUUID();
  rooms.addConnection({
    id,
    send: (message) => {
      if (webSocket.readyState === webSocket.OPEN) webSocket.send(JSON.stringify(message));
    },
  });
  webSocket.on('message', (data, isBinary) => {
    if (isBinary) return;
    rooms.handleMessage(id, data.toString());
  });
  webSocket.on('close', () => rooms.removeConnection(id));
  webSocket.on('error', () => webSocket.terminate());
}

httpServer.listen(port, () => {
  console.log('');
  console.log(`  方塊格奪旗 伺服器已啟動（${isDev ? '開發模式' : '正式模式'}）`);
  console.log('');
  console.log(`  本機：     http://localhost:${port}`);
  for (const address of lanAddresses()) {
    console.log(`  同網路：   http://${address}:${port}`);
  }
  console.log('');
  console.log('  按 Ctrl + C 停止');
  console.log('');
});

/** 這台電腦在區域網路上的位址（同一個 Wi-Fi 的其他裝置可以用） */
function lanAddresses(): string[] {
  const result: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address);
    }
  }
  return result;
}
