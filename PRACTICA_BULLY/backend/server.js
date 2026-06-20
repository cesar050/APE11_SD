const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const projectRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const envPath = path.join(__dirname, 'peers.env');
const stateDir = path.join(__dirname, 'state');
const consensusPath = path.join(stateDir, 'consensus.json');
const consensusTriggerPath = path.join(stateDir, 'consensus-trigger.json');
const logPath = path.join(stateDir, 'log.txt');
const port = Number(process.env.PORT || 3000);
const pingTimeoutMs = Number(process.env.PING_TIMEOUT_MS || 700);
const pingRetries = Number(process.env.PING_RETRIES || 1);

function getReplyHost() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, content, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(content);
}

function readEnvFile() {
  const text = fs.readFileSync(envPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const data = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    data[key] = value;
  }

  const peers = (data.PEERS || '')
    .split(',')
    .map((peer, index) => {
      const [host, portValue] = peer.trim().split(':');
      return {
        id: index + 1,
        label: `P${index + 1}`,
        host: host || '',
        port: portValue ? Number(portValue) : null,
      };
    })
    .filter((peer) => peer.host);

  const infected = (data.BIZANTINOS || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return {
    peers,
    infected,
    heartbeatIntervalMs: Number(data.HEARTBEAT_INTERVAL_MS || 2000),
    electionTimeoutMs: Number(data.ELECTION_TIMEOUT_MS || 8000),
    okWaitMs: Number(data.OK_WAIT_MS || 3000),
  };
}

function writeEnvFile(infectedIds) {
  const text = fs.readFileSync(envPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const replacement = `BIZANTINOS=${infectedIds.join(',')}`;
  let found = false;

  const updated = lines.map((line) => {
    if (/^\s*BIZANTINOS\s*=/.test(line)) {
      found = true;
      return replacement;
    }
    return line;
  });

  if (!found) {
    updated.push(replacement);
  }

  fs.writeFileSync(envPath, updated.join('\n'));
}

function triggerConsensusRecalculation(infectedIds) {
  const payload = {
    requestedAt: new Date().toISOString(),
    infectedIds,
  };
  fs.writeFileSync(consensusTriggerPath, JSON.stringify(payload, null, 2));
}

function readConsensus() {
  if (!fs.existsSync(consensusPath)) {
    return { available: false };
  }

  try {
    const raw = fs.readFileSync(consensusPath, 'utf8');
    const data = JSON.parse(raw);
    return { available: true, ...data };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

function pingPeer(peer, timeoutMs = pingTimeoutMs) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const replyHost = getReplyHost();
    let settled = false;
    let timer = null;

    const finish = (online, reason = '') => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket.close();
      } catch (_) {}
      resolve({ ...peer, online, reason });
    };

    socket.once('message', () => finish(true));
    socket.once('error', (error) => finish(false, error.message));

    socket.bind(0, () => {
      const localPort = socket.address().port;
      timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
      const message = Buffer.from(`PING:0:${replyHost}:${localPort}`);

      socket.send(message, peer.port, peer.host, (error) => {
        if (error) finish(false, error.message);
      });
    });
  });
}

async function scanPeers(peers) {
  return Promise.all(peers.map(async (peer) => {
    let lastResult = null;
    for (let attempt = 0; attempt <= pingRetries; attempt++) {
      lastResult = await pingPeer(peer);
      if (lastResult.online) break;
    }
    return lastResult || { ...peer, online: false, reason: 'unreachable' };
  }));
}

function inferCoordinator(onlinePeers, consensus) {
  const candidate = [...onlinePeers].sort((a, b) => b.id - a.id)[0] || null;

  if (candidate) {
    return { id: candidate.id, label: candidate.label, host: candidate.host, port: candidate.port, source: 'live' };
  }

  if (consensus && consensus.available && Number.isInteger(consensus.coordinator)) {
    return {
      id: consensus.coordinator,
      label: `P${consensus.coordinator}`,
      host: '',
      port: null,
      source: 'consensus-stale',
    };
  }

  return null;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    default: return 'text/plain; charset=utf-8';
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, readEnvFile());
  }

  if (requestUrl.pathname === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const payload = body ? JSON.parse(body) : {};
      const infectedIds = Array.isArray(payload.infectedIds)
        ? payload.infectedIds
        : Array.isArray(payload.infected)
          ? payload.infected
          : payload.infectedId != null
            ? [payload.infectedId]
            : [];

      const sanitized = [...new Set(infectedIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
      writeEnvFile(sanitized);
      return sendJson(res, 200, { ok: true, infected: sanitized, config: readEnvFile() });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }

  if (requestUrl.pathname === '/api/consensus/run' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const payload = body ? JSON.parse(body) : {};
      const infectedIds = Array.isArray(payload.infectedIds)
        ? payload.infectedIds
        : [];
      triggerConsensusRecalculation(infectedIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: error.message });
    }
  }

  if (requestUrl.pathname === '/api/consensus' && req.method === 'GET') {
    return sendJson(res, 200, readConsensus());
  }

  if (requestUrl.pathname === '/api/status' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await buildStatus());
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\//, '');
  const filePath = path.resolve(frontendRoot, relativePath);

  if (!filePath.startsWith(frontendRoot)) {
    return sendText(res, 403, 'Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendText(res, 404, 'Not found');
  }

  return sendText(res, 200, fs.readFileSync(filePath), contentType(filePath));
});

async function buildStatus() {
  const config = readEnvFile();
  const consensus = readConsensus();
  const nodes = await scanPeers(config.peers);
  const activeNodes = nodes.filter((peer) => peer.online);
  const isolatedNodes = nodes.filter((peer) => !peer.online);
  const coordinator = inferCoordinator(activeNodes, consensus);
  const clusterState = coordinator
    ? (isolatedNodes.length === 0 ? 'ESTABLE' : 'RECUPERACION')
    : isolatedNodes.length > 0 && activeNodes.length > 0
      ? 'ELECCION'
      : isolatedNodes.length === 0
        ? 'ESTABLE'
        : 'SIN_NODOS';

  return {
    config,
    consensus,
    nodes,
    activeNodes,
    isolatedNodes,
    coordinator,
    clusterState,
    stats: {
      total: config.peers.length,
      active: activeNodes.length,
      isolated: isolatedNodes.length,
      infected: config.infected.length,
    },
    updatedAt: new Date().toISOString(),
  };
}

const wss = new WebSocketServer({ server });
const wsClients = new Set();
let statusBroadcastBusy = false;

function broadcast(type, data) {
  const message = JSON.stringify({ type, data });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  wsClients.add(ws);
  buildStatus()
    .then((status) => ws.send(JSON.stringify({ type: 'status', data: status })))
    .catch(() => {});
  ws.on('close', () => wsClients.delete(ws));
});

async function broadcastStatus() {
  if (statusBroadcastBusy || wsClients.size === 0) return;
  statusBroadcastBusy = true;
  try {
    broadcast('status', await buildStatus());
  } catch (_) {
  } finally {
    statusBroadcastBusy = false;
  }
}

const statusIntervalMs = Number(process.env.STATUS_INTERVAL_MS || 3000);

fs.mkdirSync(stateDir, { recursive: true });

// Poll log.txt every 200ms for new lines (replaces fs.watch, reliable with Docker volumes)
let logLastSize = 0;
try { logLastSize = fs.statSync(logPath).size; } catch (_) { fs.writeFileSync(logPath, ''); }

setInterval(() => {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size <= logLastSize) return;
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(stats.size - logLastSize);
    fs.readSync(fd, buf, 0, buf.length, logLastSize);
    fs.closeSync(fd);
    logLastSize = stats.size;
    for (const line of buf.toString('utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed) broadcast('log', trimmed);
    }
  } catch (_) {}
}, 200);

// Poll consensus.json every 500ms for changes (replaces fs.watch)
let consensusMtime = 0;
try { consensusMtime = fs.statSync(consensusPath).mtimeMs; } catch (_) {}

setInterval(() => {
  try {
    const stats = fs.statSync(consensusPath);
    if (stats.mtimeMs > consensusMtime) {
      consensusMtime = stats.mtimeMs;
      broadcast('consensus', readConsensus());
    }
  } catch (_) {}
}, 500);

server.listen(port, () => {
  console.log(`Frontend disponible en http://localhost:${port}`);
  console.log(`WebSocket activo en ws://localhost:${port}`);
  setInterval(() => broadcastStatus().catch(() => {}), statusIntervalMs);
});
