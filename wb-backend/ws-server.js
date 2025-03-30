const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils.js');
const crypto = require('crypto');
const cors = require('cors');
const Y = require('yjs');

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';


const ANONYMOUS_USER_REGEX = /^User-\d+$/;

const clients = new Map();
const rooms = new Map();

const server = http.createServer((req, res) => {
  const corsMiddleware = cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  });
  
  corsMiddleware(req, res, () => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeConnections: wss.clients.size,
        activeRooms: rooms.size
      }));
    } else if (req.url === '/create-room') {
      const roomCode = crypto.randomUUID().slice(0, 4);
      if (!rooms.has(roomCode)) {
        rooms.set(roomCode, new Y.Doc());
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roomCode }));
    } else if (req.url.startsWith('/check-room')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const roomCode = url.searchParams.get('roomCode');
      const exists = rooms.has(roomCode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ exists }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Yjs WebSocket Server is running\n');
    }
  });
});

const wss = new WebSocket.Server({ server });


wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const roomCode = url.searchParams.get('room');
  const connectionType = url.searchParams.get('type');
  const userName = url.searchParams.get('username') || `User-${Math.floor(Math.random() * 1000)}`;

  //console.log(`Connection requested - Username: ${userName}, Room: ${roomCode}`);
  
  if (!roomCode) {
    ws.close(1000, 'No room code provided');
    return;
  }

  // Get the document name from the WebSocket protocol path
  // This is set by y-websocket when creating the WebsocketProvider
  const pathParts = url.pathname.split('/');
  const docName = pathParts[pathParts.length - 1] || roomCode;
  
  // Use the room code alone as the unique identifier
  // This ensures each room gets its own document
  const roomDocKey = roomCode;
  
  if (!rooms.has(roomDocKey)) {
    rooms.set(roomDocKey, new Y.Doc());
  }

  const yDoc = rooms.get(roomDocKey);

  if (connectionType === 'awareness' && !ANONYMOUS_USER_REGEX.test(userName)) {

    const clientId = crypto.randomUUID();
    
    for (const [existingId, client] of clients.entries()) {
      if (client.ip === req.socket.remoteAddress && client.roomCode === roomCode) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close(1000, 'New connection from same IP');
        }
        clients.delete(existingId);
      }
    }
    
    const clientInfo = {
      id: clientId,
      connectedAt: new Date(),
      ip: req.socket.remoteAddress,
      lastActive: new Date(),
      userName,
      roomCode,
      ws
    };
    
    clients.set(clientId, clientInfo);

    ws.on('close', () => {
      clients.delete(clientId);
    });
    
    ws.on('message', () => {
      if (clients.has(clientId)) {
        clients.get(clientId).lastActive = new Date();
      }
    });
  }

  setupWSConnection(ws, req, {
    doc: yDoc,
    cors: true,
    maxBackoffTime: 2500,
    gc: false
  });

});

const getConnectedClients = () => {
  return Array.from(clients.values()).map(client => ({
    id: client.id,
    connectedAt: client.connectedAt,
    ip: client.ip,
    lastActive: client.lastActive,
    userName: client.userName,
    roomCode: client.roomCode,
    connectionDuration: Date.now() - client.connectedAt
  }));
};

setInterval(() => {
  const activeClients = getConnectedClients();
  console.log('Active clients:', activeClients);
}, 60000);


server.listen(port, host, () => {
  console.log(`Yjs WebSocket Server is running on ws://${host}:${port}`);
  
  process.on('SIGINT', () => {
    wss.close(() => {
      console.log('WebSocket server closed');
      process.exit(0);
    });
  });
});