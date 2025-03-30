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
require('dotenv').config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';
const ANONYMOUS_USER_REGEX = /^User-\d+$/;
const OUTPUT_DIR = path.join(__dirname, 'generated-images');
// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

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
    } else if (req.url.startsWith('/generate')) {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
  
      req.on('end', async () => {
        try {
          const { strokes, prompt } = JSON.parse(data);
          console.log('Processing sketch:', {
            strokeCount: strokes?.length,
            prompt,
            timestamp: new Date().toISOString()
          });
  
          if (!strokes || !Array.isArray(strokes)) {
            console.error('Invalid strokes data:', strokes);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid strokes data' }));
            return;
          }
  
          // Render strokes to image buffer
          const imageBuffer = renderStrokesToCanvas(strokes);
          console.log('Canvas rendered:', {
            bufferSize: imageBuffer?.length,
            timestamp: new Date().toISOString()
          });
  
          if (!imageBuffer) {
            throw new Error('Failed to render canvas');
          }
  
          // Save the sketch
          try {
            const savedResult = await saveImage(imageBuffer);
            const sketchPath = savedResult.images[0].path;
            console.log('Sketch saved successfully:', {
              path: sketchPath,
              timestamp: new Date().toISOString()
            });
  
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
                    {text: prompt || "DRAW A CLIP ART VERSION OF THIS"},
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
                    console.log(`Output written to: ${filename}`);
                    
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
            
          } catch (genError) {
            console.error('Gemini generation failed:', {
              error: genError.message,
              stack: genError.stack
            });
            res.writeHead(500);
            res.end(JSON.stringify({ 
              error: 'Image generation failed', 
              details: genError.message 
            }));
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


const renderStrokesToCanvas = (strokes) => {
  console.log('Starting canvas rendering:', { strokeCount: strokes?.length });
  
  // Create new canvas with fixed dimensions
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');
  
  // Set white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw all strokes
  strokes?.forEach((stroke, index) => {
    console.log(`Rendering stroke ${index + 1}:`, {
      color: stroke.color,
      width: stroke.width,
      points: stroke.points?.length
    });

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
    // Save the original sketch
    fs.writeFileSync(sketchPath, imageBuffer);
    console.log('Saved sketch to file:', {
      path: sketchPath,
      size: fs.statSync(sketchPath).size
    });

    // Return the saved image path and data
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

/**
 * Uploads the given file to Gemini.
 *
 * See https://ai.google.dev/gemini-api/docs/prompting_with_media
 */
async function uploadToGemini(path, mimeType) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
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
