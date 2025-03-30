const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils.js')
const crypto = require('crypto')

// Use environment variables or default values
const port = process.env.PORT || 1234
const host = process.env.HOST || '0.0.0.0'

// Add these constants at the top after the imports
const MAX_CONNECTION_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const ANONYMOUS_USER_REGEX = /^User-\d+$/;

// Track connected clients
const clients = new Map()

// Create a basic HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Yjs WebSocket Server is running\n')
})

// Create a WebSocket server that piggybacks on the HTTP server
const wss = new WebSocket.Server({ server })

// Add cleanup function after the server creation
const cleanupStaleConnections = () => {
  const now = Date.now();
  for (const [clientId, client] of clients.entries()) {
    const connectionDuration = now - client.connectedAt;
    if (connectionDuration > MAX_CONNECTION_TIME) {
      console.log(`Kicking client ${clientId} - Connected for ${Math.round(connectionDuration / 1000)}s`);
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Session timeout (10 minutes)');
      }
      clients.delete(clientId);
    }
  }
};

// When a client connects, set up the Yjs WebSocket connection
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const connectionType = url.searchParams.get('type');
  const userName = url.searchParams.get('username');

  // Only track awareness connections with valid usernames
  if (connectionType === 'awareness' && userName && !ANONYMOUS_USER_REGEX.test(userName)) {
    const clientId = crypto.randomUUID();
    
    // Clean up any existing connections from this IP
    for (const [existingId, client] of clients.entries()) {
      if (client.ip === req.socket.remoteAddress) {
        console.log(`Cleaning up existing connection for IP: ${client.ip}`);
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
      userName: userName,
      ws: ws
    };
    
    clients.set(clientId, clientInfo);
    
    console.log(`New user connected - Name: ${userName}, ID: ${clientId}`);
    console.log(`Total users: ${clients.size}`);
    
    // Handle client disconnect
    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`User disconnected - ID: ${clientId}`);
      console.log(`Total users: ${clients.size}`);
    });
    
    // Update last active timestamp on messages
    ws.on('message', () => {
      if (clients.has(clientId)) {
        clients.get(clientId).lastActive = new Date();
      }
    });
  }

  // Enable cross-origin connections
  setupWSConnection(ws, req, { 
    cors: true,
    maxBackoffTime: 2500
  });
});

// Add helper function to get connected clients info
const getConnectedClients = () => {
  return Array.from(clients.values()).map(client => ({
    id: client.id,
    connectedAt: client.connectedAt,
    ip: client.ip,
    lastActive: client.lastActive,
    userName: client.userName,
    connectionDuration: Date.now() - client.connectedAt
  }))
}

// Log active clients
const activeClients = getConnectedClients()
console.log(activeClients)

// Add cleanup interval before server.listen
const cleanup = setInterval(cleanupStaleConnections, CHECK_INTERVAL);

// Start the server
server.listen(port, host, () => {
  console.log(`Yjs WebSocket Server is running on ws://${host}:${port}`);
  
  // Clean up on server shutdown
  process.on('SIGINT', () => {
    clearInterval(cleanup);
    wss.close(() => {
      console.log('WebSocket server closed');
      process.exit(0);
    });
  });
})