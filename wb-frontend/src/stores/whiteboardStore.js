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
  penSize: 4,
  cursorPosition: { x: 0, y: 0 },
  showCursor: false,
  isDrawing: false,
  
  // Y.js state
  isConnected: false,
  clientID: null,
  awarenessStates: [],
  
  // Add undo/redo stacks
  undoStack: [],
  redoStack: [],
  
  // Add a map to track local vs remote strokes
  localStrokes: new Map(),
  
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
        const state = get();
        // Clear existing state
        state.clearBgCanvas();
        state.localStrokes.clear();
        
        // Load all strokes from Y.js
        const currentStrokes = yStrokes.toArray();        
        // Process each stroke
        currentStrokes.forEach(strokeData => {
          const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
          if (stroke && stroke.points) {
            if (stroke.clientID === ydoc.clientID) {
              // If it's our stroke, store it locally uncompressed
              state.localStrokes.set(stroke.id, stroke);
            }
            get().drawStrokeOnBg(stroke);
          }
        });
      }
    });
    
    // Handle new strokes and deletions from other clients
    yStrokes.observe(event => {
      // Handle deleted strokes
      if (event.changes.deleted && event.changes.deleted.size > 0) {
        // Clear and redraw everything when strokes are deleted
        const state = get();
        state.clearBgCanvas();
        
        // Redraw all remaining strokes
        yStrokes.toArray().forEach(item => {
          const stroke = Array.isArray(item) ? item[0] : item;
          if (stroke && stroke.points) {
            if (stroke.clientID === ydoc.clientID) {
              state.localStrokes.set(stroke.id, stroke);
            }
            get().drawStrokeOnBg(stroke);
          }
        });
        return;
      }

      // Handle added strokes
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
          // Only process remote strokes
          if (stroke && stroke.points && stroke.clientID !== ydoc.clientID) {
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
      clientID: ydoc?.clientID,  // Add clientID to stroke
      points: [point],
      toolType: state.selectedTool,
      color: state.penColor,
      width: state.penSize
    },
    isDrawing: true
  })),
  
  updateLine: (point) => set(state => {
    if (!state.currentLine) return state;
    // Get the last point
    const lastPoint = state.currentLine.points[state.currentLine.points.length - 1];
    
    // If this is a hand tracking point, apply smoothing
    if (point.fromHandTracking) {
      const maxDistance = 100;
      const threshold = 5;
      
      const distance = Math.sqrt(
        Math.pow(lastPoint.x - point.x, 2) +
        Math.pow(lastPoint.y - point.y, 2)
      );
      
      // Skip update if point is too close or too far
      if (distance < threshold || distance > maxDistance) {
        return state;
      }
      
      // Apply adaptive smoothing
      const speedFactor = Math.min(distance / maxDistance, 1);
      point = {
        x: lastPoint.x + (point.x - lastPoint.x) * speedFactor,
        y: lastPoint.y + (point.y - lastPoint.y) * speedFactor
      };
    }
    
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
    
    // Keep track of this local stroke
    state.localStrokes.set(state.currentLine.id, state.currentLine);
    
    // Draw the uncompressed stroke to background
    get().drawStrokeOnBg(state.currentLine);
    
    // Add compressed version to Y.js if connected
    if (yStrokes) {
      try {
        const compressedStroke = {
          points: get().compressStroke(state.currentLine.points),
          color: state.currentLine.color,
          width: state.currentLine.width,
          clientID: state.currentLine.clientID,
          id: state.currentLine.id
        };
        yStrokes.push([compressedStroke]);
      } catch (err) {
        console.error('Failed to push stroke to Y.js:', err);
      }
    }
    
    set({
      lines: [...state.lines, state.currentLine],
      currentLine: null,
      isDrawing: false
    });
  },
  
  // Add undo/redo methods
  undo: () => {
    const state = get();
    const currentClientID = ydoc?.clientID;
    
    // Find the most recent stroke by this client
    const strokeIndex = state.undoStack.findLastIndex(
      stroke => stroke.clientID === currentClientID
    );
    
    if (strokeIndex === -1) return;
    
    // Remove the stroke from undoStack and add to redoStack
    const strokeToUndo = state.undoStack[strokeIndex];
    const newUndoStack = [
      ...state.undoStack.slice(0, strokeIndex),
      ...state.undoStack.slice(strokeIndex + 1)
    ];
    
    // Remove from Y.js
    if (yStrokes) {
      const yStrokeIndex = yStrokes.toArray().findIndex(
        stroke => (Array.isArray(stroke) ? stroke[0] : stroke).id === strokeToUndo.id
      );
      if (yStrokeIndex !== -1) {
        yStrokes.delete(yStrokeIndex, 1);
      }
    }
    
    // Redraw background
    get().clearBgCanvas();
    newUndoStack.forEach(stroke => get().drawStrokeOnBg(stroke));
    
    set(state => ({
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, strokeToUndo]
    }));
  },

  redo: () => {
    const state = get();
    const currentClientID = ydoc?.clientID;
    
    // Find the most recent stroke by this client in the redo stack
    const strokeIndex = state.redoStack.findLastIndex(
      stroke => stroke.clientID === currentClientID
    );
    
    if (strokeIndex === -1) return;
    
    // Remove the stroke from redoStack and add back to undoStack
    const strokeToRedo = state.redoStack[strokeIndex];
    const newRedoStack = [
      ...state.redoStack.slice(0, strokeIndex),
      ...state.redoStack.slice(strokeIndex + 1)
    ];
    
    // Add back to Y.js
    if (yStrokes) {
      yStrokes.push([strokeToRedo]);
    }
    
    // Redraw the stroke
    get().drawStrokeOnBg(strokeToRedo);
    
    set(state => ({
      redoStack: newRedoStack,
      undoStack: [...state.undoStack, strokeToRedo]
    }));
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
      // Use transact to batch the deletion
      ydoc.transact(() => {
        yStrokes.delete(0, yStrokes.length);
      });
    }
    
    state.localStrokes.clear();
    
    return set({ 
      lines: [], 
      currentLine: null,
      isDrawing: false,
      undoStack: [],
      redoStack: []
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
  setBgCanvas: (canvas) => {
    const width = window.innerWidth;
    const height = window.innerHeight - 48;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    
    ctx.scale(dpr, dpr);
    
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    set({ bgCanvas: canvas });
  },
  
  // Stroke rendering
  renderStroke: (stroke, targetCtx) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    targetCtx.save();
    const dpr = window.devicePixelRatio || 1;
    targetCtx.scale(dpr, dpr);
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
    
    // Provider sync handler - only redraw remote strokes
    provider?.on('sync', () => {
      const state = get();
      // Clear canvas
      get().clearBgCanvas();
      
      // First draw all remote strokes
      yStrokes.toArray().forEach(item => {
        const strokeData = Array.isArray(item) ? item[0] : item;
        if (strokeData && strokeData.clientID !== ydoc.clientID) {
          get().drawStrokeOnBg(strokeData);
        }
      });
      
      // Then draw local strokes (uncompressed)
      state.localStrokes.forEach(stroke => {
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