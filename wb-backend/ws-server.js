require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils.js');
const crypto = require('crypto');
const cors = require('cors');
const Y = require('yjs');
const path = require('path');
const { createCanvas } = require('canvas');
const fs = require("node:fs");
const mime = require("mime-types");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const apiKey = process.env.GOOGLE_API_KEY;
const environment = process.env.ENVIRONMENT || 'production';

const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';
const OUTPUT_DIR = path.join(__dirname, 'generated-images');

class RateLimiter {
  constructor(windowMs = 60000, maxConnections = 200) {
    this.windowMs = windowMs;
    this.maxConnections = maxConnections;
    this.connections = new Map();
  }

  isRateLimited(ip) {
    const now = Date.now();
    const history = this.connections.get(ip) || [];
    
    // Keep only connections within the time window
    const recentConnections = history.filter(ts => now - ts < this.windowMs);
    
    // Add new connection timestamp
    recentConnections.push(now);
    this.connections.set(ip, recentConnections);

    return recentConnections.length > this.maxConnections;
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this.connections.entries()) {
      const valid = timestamps.filter(ts => now - ts < this.windowMs);
      if (valid.length === 0) {
        this.connections.delete(ip);
      } else {
        this.connections.set(ip, valid);
      }
    }
  }
}

const prompt = `
You are a teacher who is trying to make a student's artwork look nicer to impress their parents. You have been given this drawing, and you must enhance, refine and complete this drawing while maintaining its core elements and shapes. Try your best to leave the student's original work there, but add to the scene to make an impressive drawing. You may also only use the following colors: red, green, blue, black, and white.

in other words:
- REPEAT the entire drawing. Keep the scale the same.
- ENHANCE by adding additional lines, colors, fill, etc.
- COMPLETE by adding other features to the foreground and background

Leave the background white, and use thick strokes.

but DO NOT
- modify the original drawing in any way

The image should be the same aspect ratio, and have ALL of the same original lines. Otherwise, the parent might suspect that the teacher did some of the work.`;

const sanitizeInput = (input) => {
  return input
    .replace(/[&<>"']/g, (char) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
      };
      return entities[char];
    })
    .replace(/[<>]/g, '') // Remove < and >
    .trim()
    .slice(0, 16); // Limit length
};


// Function to clean entire directory (only used at startup and shutdown)
const cleanDirectory = () => {
  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR);
    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(OUTPUT_DIR, file));
      } catch (err) {
        console.error(`Error deleting file ${file}:`, err);
      }
    });
    console.log('Cleaned generated-images directory');
  }
};

// Create output directory if it doesn't exist and clean it
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
} else {
  cleanDirectory();
}

const clients = new Map();
const rooms = new Map();
const ROOM_CLEANUP_DELAY = 10 * 60 * 1000; // 10 minutes
const roomTimeouts = new Map();
const WSrateLimiter = new RateLimiter(5000, 30); // 30 connections every 5 seconds
const httpRateLimiter = new RateLimiter(5000, 10); // 10 requests every 5 seconds

setInterval(() => WSrateLimiter.cleanup(), 10000);
setInterval(() => httpRateLimiter.cleanup(), 10000);

const server = http.createServer((req, res) => {
  const ip = req.socket.remoteAddress;
  if (httpRateLimiter.isRateLimited(ip)) {
    console.warn(`Too many requests from ${ip}`);
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }
  const corsMiddleware = cors({
    origin: environment === 'production' 
      ? ['https://gandalf.design', 'https://www.gandalf.design'] 
      : ['http://localhost:5173'],
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
    } else if (req.url.startsWith('/generate')) {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
  
      req.on('end', async () => {
        try {
          const { strokes } = JSON.parse(data);
  
          if (!strokes || !Array.isArray(strokes)) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid strokes data' }));
            return;
          }
  
          // Render strokes to image buffer
          const imageBuffer = renderStrokesToCanvas(strokes);

          if (!imageBuffer) {
            throw new Error('Failed to render canvas');
          }
  
          // Save the sketch
          try {
            const savedResult = await saveImage(imageBuffer);
            const sketchPath = savedResult.images[0].path;

  
            // Using the highlighted code - upload to Gemini and generate image
            const files = [
              await uploadToGemini(sketchPath, "image/png"),
            ];
  
            const chatSession = model.startChat({
              generationConfig,
              history: [
                {
                  role: "user",
                  parts: [
                    {
                      fileData: {
                        mimeType: files[0].mimeType,
                        fileUri: files[0].uri,
                      },
                    },
                  ],
                },
              ],
            });
            
            const result = await chatSession.sendMessage(prompt || "Draw a clip art version of this");
  
            const generatedImages = [];
            const candidates = result.response.candidates;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            
            for(let candidate_index = 0; candidate_index < candidates.length; candidate_index++) {
              for(let part_index = 0; part_index < candidates[candidate_index].content.parts.length; part_index++) {
                const part = candidates[candidate_index].content.parts[part_index];
                if(part.inlineData) {
                  try {
                    const filename = path.join(OUTPUT_DIR, `generated-${timestamp}-${candidate_index}-${part_index}.${mime.extension(part.inlineData.mimeType)}`);
                    fs.writeFileSync(filename, Buffer.from(part.inlineData.data, 'base64'));
                    
                    generatedImages.push({
                      mimeType: part.inlineData.mimeType,
                      data: part.inlineData.data,
                      path: filename
                    });
                  } catch (err) {
                    console.error(err);
                  }
                }
              }
            }
  
            // Return all results
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              images: generatedImages,
              text: result.response.text(),
              originalSketch: savedResult.images[0]
            }));
            
            // Clean up files immediately after sending response
            try {
              // Delete the original sketch
              fs.unlinkSync(sketchPath);
              // Delete all generated images
              generatedImages.forEach(img => {
                fs.unlinkSync(img.path);
              });
              console.log('Cleaned up temporary files');
            } catch (cleanupError) {
              console.error('Error cleaning up files:', cleanupError);
            }
          } catch (genError) {
            console.error('Gemini generation failed:', {
              error: genError.message,
              stack: genError.stack
            });
            res.writeHead(500);
            res.end(JSON.stringify({ error: genError.message }));
          }
        } catch (error) {
          console.error('Request processing error:', {
            error: error.message,
            stack: error.stack
          });
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Yjs WebSocket Server is running\n');
    }
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  ip = req.socket.remoteAddress;
  if (WSrateLimiter.isRateLimited(ip)) {
    console.warn(`Too many connections from ${ip}`);
    ws.close(1008, 'Too many connections from your IP');
    return;
  }

  const url = new URL(req.url, `ws://${req.headers.host}`);
  const roomCode = /^[A-Za-z0-9-]{4,12}$/.test(url.searchParams.get('room'));
  const connectionType = url.searchParams.get('type')?.split('/')[0];
  const userName = sanitizeInput(url.searchParams.get('username')?.split('/')[0]) || `User-${Math.floor(Math.random() * 1000)}`;
  const userColor = /^#[0-9A-F]{6}$/i.test(url.searchParams.get('color')) 
    ? url.searchParams.get('color')
    : `#${Math.floor(Math.random() * 16777215).toString(16)}`;


  if (!roomCode) {
    ws.close(1000, 'No room code provided');
    return;
  }

  const pathParts = url.pathname.split('/');
  const docName = pathParts[pathParts.length - 1] || roomCode;
  const roomDocKey = roomCode;

  if (!rooms.has(roomDocKey)) {
    rooms.set(roomDocKey, new Y.Doc());
  }

  const yDoc = rooms.get(roomDocKey);

  if (connectionType === 'awareness') {
    const clientID = crypto.randomUUID();

    const newUser = { 
      clientID, 
      userName,
      color: userColor
    };
    // Get existing users in the room
    const activeUsers = Array.from(clients.values())
      .filter(c => c.roomCode === roomCode)
      .map(c => ({
        clientID: c.id,
        userName: c.userName,
        color: c.color
      }));

    // Add the new user to the list
    activeUsers.push(newUser);

    // Send the complete active users list to everyone (including the new user)
    const activeUsersMessage = JSON.stringify({
      type: 'active-users',
      users: activeUsers
    });

    // Send to all clients in the room, including the new one
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(activeUsersMessage);
      }
    });

    const clientInfo = {
      id: clientID,
      connectedAt: new Date(),
      ip: req.socket.remoteAddress,
      lastActive: new Date(),
      userName,
      roomCode,
      ws,
      color: userColor
    };

    clients.set(clientID, clientInfo);

    ws.on('close', () => {
      clients.delete(clientID);
      // Send updated active users list after user leaves
      const remainingUsers = Array.from(clients.values())
        .filter(c => c.roomCode === roomCode)
        .map(c => ({
          clientID: c.id,
          userName: c.userName,
          color: c.color
        }));

        if (remainingUsers.length === 0) {
          scheduleRoomCleanup(roomCode);
        }

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'active-users',
            users: remainingUsers
          }));
        }
      });
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
}, 3600000);

server.listen(port, host, () => {
  console.log(`Yjs WebSocket Server is running on ws://${host}:${port}`);
  process.on('SIGINT', () => {
    cleanDirectory(); // Clean up files before shutting down
    wss.close(() => {
      console.log('WebSocket server closed');
      process.exit(0);
    });
  });
});

const renderStrokesToCanvas = (strokes) => {  
  const canvas = createCanvas(2500, 1600);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  strokes?.forEach((stroke, index) => {
    if (!stroke.points?.length) return;

    ctx.beginPath();
    ctx.strokeStyle = stroke.color || 'black';
    ctx.lineWidth = stroke.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  });

  return canvas.toBuffer('image/png');
};

async function saveImage(imageBuffer) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sketchPath = path.join(OUTPUT_DIR, `sketch-${timestamp}.png`);
  
  try {
    fs.writeFileSync(sketchPath, imageBuffer);

    return {
      images: [{
        mimeType: "image/png",
        data: fs.readFileSync(sketchPath).toString('base64'),
        path: sketchPath
      }],
      text: "Sketch saved successfully"
    };
  } catch (error) {
    console.error('Error saving sketch:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

const scheduleRoomCleanup = (roomCode) => {
  // Clear any existing timeout
  if (roomTimeouts.has(roomCode)) {
    clearTimeout(roomTimeouts.get(roomCode));
  }

  // Schedule new cleanup
  const timeout = setTimeout(() => {
    const hasActiveUsers = Array.from(clients.values())
      .some(client => client.roomCode === roomCode);
    
    if (!hasActiveUsers) {
      rooms.delete(roomCode);
      roomTimeouts.delete(roomCode);
      console.log(`Cleaned up inactive room: ${roomCode}`);
    }
  }, ROOM_CLEANUP_DELAY);

  roomTimeouts.set(roomCode, timeout);
};

async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  return file;
}

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp-image-generation",
});

const generationConfig = {
  temperature: 0.01,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseModalities: [
    "image",
    "text",
  ],
  responseMimeType: "text/plain",
};
