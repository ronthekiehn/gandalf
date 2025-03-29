import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils.js';

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', setupWSConnection);

console.log('WebSocket server running on port 1234');
