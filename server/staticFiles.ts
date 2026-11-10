// 正式模式：把 web/dist 裡打包好的網頁檔案送給瀏覽器。

import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function serveStaticFile(rootDir: string, request: IncomingMessage, response: ServerResponse): void {
  if (!existsSync(join(rootDir, 'index.html'))) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('找不到打包好的網頁。請先執行 npm run build，或改用 npm run dev。');
    return;
  }

  const urlPath = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  // 防止用 ../ 讀到資料夾外面的檔案
  const filePath = normalize(join(rootDir, urlPath));
  const insideRoot = filePath === rootDir || filePath.startsWith(rootDir.endsWith(sep) ? rootDir : rootDir + sep);
  const target =
    insideRoot && existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(rootDir, 'index.html');

  response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream' });
  createReadStream(target).pipe(response);
}
