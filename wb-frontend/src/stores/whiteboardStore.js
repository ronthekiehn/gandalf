import { create } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Y.js connection singleton
let ydoc = null;
let provider = null;
let yStrokes = null;
let awareness = null;

const useWhiteboardStore = create((set, get) => ({
  // Drawing state
  lines: [],
  currentLine: null,
  selectedTool: 'pen',
  penColor: 'black',
  penSize: 3,
  cursorPosition: { x: 0, y: 0 },
  showCursor: false,
  isDrawing: false,
  
  // Y.js state
  isConnected: false,
  clientID: null,
  awarenessStates: [],
  
  // Initialize Y.js connection
  initializeYjs: (roomCode, userName) => {
    // Return early if already initialized
    if (ydoc && provider && yStrokes) return;
    
    console.log(`Initializing Y.js with room: ${roomCode}`);
    
    // Create Y.js doc
    ydoc = new Y.Doc();
    
    // Set up WebSocket connection
    const wsUrl = new URL('wss://ws.ronkiehn.dev');
    wsUrl.searchParams.set('username', userName);
    wsUrl.searchParams.set('room', roomCode);
    wsUrl.pathname = `/${roomCode}`;
    
    // Create provider
    provider = new WebsocketProvider(wsUrl.toString(), roomCode, ydoc);
    yStrokes = ydoc.getArray('strokes');
    awareness = provider.awareness;
    
    // Set client ID
    set({ clientID: ydoc.clientID });
    
    // Handle connection status changes
    provider.on('status', ({ status }) => {
      console.log(`Room ${roomCode} - WebSocket status:`, status);
      set({ isConnected: status === 'connected' });
      
      if (status === 'connected') {
        const currentStrokes = yStrokes.toArray();
        console.log('Initial strokes:', currentStrokes);
        currentStrokes.forEach(strokeData => {
          const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
          if (stroke && stroke.points) {
            get().drawStrokeOnBg(stroke);
          }
        });
      }
    });
    
    // Handle new strokes from other clients
    yStrokes.observe(event => {
      event.changes.added.forEach(item => {
        let content;
        if (item.content && item.content.getContent) {
          content = item.content.getContent();
        } else if (Array.isArray(item.content)) {
          content = item.content;
        } else {
          console.warn("Unexpected content format:", item.content);
          return;
        }
        
        content.forEach(strokeData => {
          const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
          if (stroke && stroke.points) {
            get().drawStrokeOnBg(stroke);
            get().importLines([stroke]);
          }
        });
      });
    });
    
    // Handle awareness changes
    awareness.on('change', () => {
      const states = Array.from(awareness.getStates());
      set({ awarenessStates: states });
    });
  },
  
  // Clean up Y.js resources
  cleanupYjs: () => {
    if (provider) {
      provider.disconnect();
      provider = null;
    }
    if (ydoc) {
      ydoc.destroy();
      ydoc = null;
    }
    yStrokes = null;
    awareness = null;
    set({ isConnected: false, clientID: null });
  },
  
  // Get Y.js resources
  getYjsResources: () => ({
    ydoc,
    provider,
    yStrokes,
    awareness
  }),
  
  // Update awareness state
  updateAwareness: (state) => {
    if (awareness) {
      awareness.setLocalState(state);
    }
  },
  
  // Clear awareness state
  clearAwareness: () => {
    if (awareness) {
      awareness.setLocalState(null);
    }
  },
  
  // Add cursor history for smoothing
  cursorHistory: [],
  cursorHistorySize: 5,
  
  startLine: (point) => set(state => ({
    currentLine: {
      id: Date.now().toString(),
      points: [point],
      toolType: state.selectedTool,
      color: state.penColor,
      width: state.penSize
    },
    isDrawing: true
  })),
  
  updateLine: (point) => set(state => {
    if (!state.currentLine) return state;
    return {
      currentLine: { 
        ...state.currentLine, 
        points: [...state.currentLine.points, point] 
      }
    };
  }),
  
  completeLine: () => {
    const state = get();
    if (!state.currentLine) return set({ isDrawing: false });
    
    const processedStroke = state.currentLine.points.length > 2 
      ? {
          ...state.currentLine,
          points: get().compressStroke(state.currentLine.points)
        }
      : state.currentLine;
    
    // Add to Y.js if connected
    if (yStrokes) {
      console.log('Adding stroke to Y.js:', processedStroke);
      try {
        yStrokes.push([{
          points: processedStroke.points,
          color: processedStroke.color,
          width: processedStroke.width
        }]);
      } catch (err) {
        console.error('Failed to push stroke to Y.js:', err);
      }
    }
    
    set({
      lines: [...state.lines, processedStroke],
      currentLine: null,
      isDrawing: false
    });
  },
  
  // Tool settings
  setTool: (tool) => set({ selectedTool: tool }),
  setColor: (color) => set({ penColor: color }),
  setPenSize: (size) => set({ penSize: size }),
  
  // Cursor tracking
  updateCursorPosition: (position) =>  set({ cursorPosition: position }),
  
  setShowCursor: (show) => set({ showCursor: show }),
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  
  // Canvas operations
  clearCanvas: () => {
    const state = get();
    if (state.bgCanvas) {
      const bgCtx = state.bgCanvas.getContext('2d');
      bgCtx.clearRect(0, 0, state.bgCanvas.width, state.bgCanvas.height);
    }
    
    // Clear Y.js array if connected
    if (yStrokes) {
      yStrokes.delete(0, yStrokes.length);
    }
    
    return set({ 
      lines: [], 
      currentLine: null,
      isDrawing: false 
    });
  },
  
  compressStroke: (points) => {
    if (points.length <= 2) return points;

    const tolerance = 2;
    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const current = points[i];
      const next = points[i + 1];

      const dx1 = current.x - prev.x;
      const dy1 = current.y - prev.y;
      const dx2 = next.x - current.x;
      const dy2 = next.y - current.y;

      const angle1 = Math.atan2(dy1, dx1);
      const angle2 = Math.atan2(dy2, dx2);
      const angleDiff = Math.abs(angle1 - angle2);

      if (angleDiff > tolerance * 0.1 ||
          Math.sqrt(dx1*dx1 + dy1*dy1) > tolerance * 5) {
        result.push(current);
      }
    }

    result.push(points[points.length - 1]);
    return result;
  },
  
  // Import external lines (from YJS)
  importLines: (newLines) => set(state => ({
    lines: [...state.lines, ...newLines]
  })),
  
  setLines: (lines) => set({ lines }),
  
  // Background canvas management
  bgCanvas: null,
  setBgCanvas: (canvas) => set({ bgCanvas: canvas }),
  
  // Stroke rendering
  renderStroke: (stroke, targetCtx) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;

    targetCtx.save();
    targetCtx.strokeStyle = stroke.color || 'black';
    targetCtx.lineWidth = stroke.width;
    targetCtx.beginPath();
    targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      targetCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    targetCtx.stroke();
    targetCtx.restore();
  },

  // Background canvas operations
  clearBgCanvas: () => {
    const state = get();
    if (!state.bgCanvas) return;
    
    const bgCtx = state.bgCanvas.getContext('2d');
    bgCtx.clearRect(0, 0, state.bgCanvas.width, state.bgCanvas.height);
  },

  drawStrokeOnBg: (stroke) => {
    const state = get();
    if (!state.bgCanvas) return;
    
    const bgCtx = state.bgCanvas.getContext('2d');
    state.renderStroke(stroke, bgCtx);
  },

  // Set up canvas sync (moved from Canvas component)
  setupCanvasSync: () => {
    if (!yStrokes) return;
    
    // Handle initial state
    const currentStrokes = yStrokes.toArray();
    currentStrokes.forEach(strokeData => {
      const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
      if (stroke && stroke.points) {
        get().drawStrokeOnBg(stroke);
      }
    });
    
    // Provider sync handler
    provider?.on('sync', () => {
      get().clearBgCanvas();
      yStrokes.forEach(item => {
        const stroke = Array.isArray(item) ? item[0] : item;
        get().drawStrokeOnBg(stroke);
      });
    });
  },
  
  // Get strokes for export/generation
  getStrokesForExport: () => {
    if (!yStrokes) return [];
    
    return yStrokes.toArray().map(stroke => {
      const strokeData = Array.isArray(stroke) ? stroke[0] : stroke;
      return {
        points: strokeData.points,
        color: strokeData.color,
        width: strokeData.width
      };
    });
  }
}));

export default useWhiteboardStore;