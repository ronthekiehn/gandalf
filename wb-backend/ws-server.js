const http = require('http')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils.js')

// Use environment variables or default values
const port = process.env.PORT || 1234
const host = process.env.HOST || '0.0.0.0'

// Create a basic HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Yjs WebSocket Server is running\n')
})

// Create a WebSocket server that piggybacks on the HTTP server
const wss = new WebSocket.Server({ server })

// When a client connects, set up the Yjs WebSocket connection
wss.on('connection', (ws, req) => {
  // setupWSConnection handles Yjs document sync
  setupWSConnection(ws, req)
})

// Start the server
server.listen(port, host, () => {
  console.log(`Yjs WebSocket Server is running on ws://${host}:${port}`)
})
