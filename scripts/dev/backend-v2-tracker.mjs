import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const trackerDirectory = path.join(repositoryRoot, 'docs/backend-v2/tracker');
const heartbeatSyncScript = path.join(trackerDirectory, 'sync-heartbeats.mjs');
const refreshIntervalMs = 30 * 60 * 1000;

const argumentsMap = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...valueParts] = argument.split('=');
    return [key, valueParts.join('=')];
  })
);
const host = argumentsMap.get('--host') || '127.0.0.1';
const port = Number(argumentsMap.get('--port') || 8765);
const shouldOpen = !argumentsMap.has('--no-open');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`无效端口：${argumentsMap.get('--port')}`);
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8']
]);

async function syncHeartbeats() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [heartbeatSyncScript], {
      cwd: repositoryRoot,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`心跳汇总失败，退出码：${code}`));
    });
  });
}

function resolveRequestedFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(trackerDirectory, relativePath);
  if (resolvedPath !== trackerDirectory && !resolvedPath.startsWith(`${trackerDirectory}${path.sep}`)) {
    return null;
  }
  return resolvedPath;
}

async function serveFile(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('只支持 GET/HEAD');
    return;
  }

  let filePath;
  try {
    filePath = resolveRequestedFile(request.url || '/');
  } catch {
    response.writeHead(400);
    response.end('请求路径无效');
    return;
  }

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('未找到');
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    response.writeHead(404);
    response.end('未找到');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': fileStat.size,
    'Content-Type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream'
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
}

function openLocalPage(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

await syncHeartbeats();

const server = http.createServer((request, response) => {
  serveFile(request, response).catch((error) => {
    response.writeHead(500);
    response.end('页面读取失败');
    process.stderr.write(`页面读取失败：${error.message}\n`);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    process.stderr.write(`端口 ${port} 已被占用。请停止旧服务，或使用 --port=其他端口。\n`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/index.html`;
  process.stdout.write(`青花植后端 v2 进度监控已启动：${url}\n`);
  process.stdout.write('服务会每 30 分钟汇总一次代理心跳；按 Ctrl+C 停止。\n');
  if (shouldOpen) openLocalPage(url);
});

const refreshTimer = setInterval(() => {
  syncHeartbeats().catch((error) => {
    process.stderr.write(`定时心跳汇总失败：${error.message}\n`);
  });
}, refreshIntervalMs);
refreshTimer.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    clearInterval(refreshTimer);
    server.close(() => process.exit(0));
  });
}
