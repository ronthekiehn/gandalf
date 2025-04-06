import { create } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { drawingSmoothing } from '../utils/smoothing';

// Y.js connection singleton
let ydoc = null;
let provider = null;
let yStrokes = null;
let yActiveStrokes = null;
let awareness = null;

const useWhiteboardStore = create((set, get) => ({
  // User state
  userName: (() => {
    const saved = localStorage.getItem('wb-username');
    return saved || `User-${Math.floor(Math.random() * 1000)}`;
  })(),
  
  userColor: `#${Math.floor(Math.random() * 16777215).toString(16)}`,

  // Add debounced username setter
  setUserName: (() => {
    let timeoutId;
    return (name) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        set({ userName: name });
        localStorage.setItem('wb-username', name);
      }, 500);
    };
  })(),

  // Drawing state
  lines: [],
  currentLine: null,
  selectedTool: 'pen',
  

  // Drawing state (keep separate from user state)
  penColor: 'black',
  penSize: 4,
  cursorPosition: { x: 0, y: 0 },
  showCursor: false,
  isDrawing: false,
  
  // Y.js state
  isConnected: false,
  clientID: null,
  awarenessStates: [],
  activeUsers: [],
  
  // Add undo/redo stacks
  undoStack: [],
  redoStack: [],
  
  // Add a map to track local vs remote strokes
  localStrokes: new Map(),
  
  // Add new state for remote active strokes
  remoteActiveStrokes: [],

  // Smoothing parameters
  smoothingParams: {
    cursorHistorySize: 1,
    cursorDeadzone: 2,
    drawingDeadzone: 5,
  },

  // Update smoothing parameters
  setSmoothingParams: (newParams) => {
    set((state) => ({
      smoothingParams: { ...state.smoothingParams, ...newParams },
    }));
  },

  // pinching params
  pinchDist: 0.1,
  setPinchDist: (dist) => set({ pinchDist: dist }),

  // more hand tracking options
  fistToClear: true,
  setFistToClear: (value) => set({ fistToClear: value }),
  
  // Initialize Y.js connection
  initializeYjs: (roomCode, userName) => {
    // Return early if already initialized
    if (ydoc && provider && yStrokes) return;
    
    console.log(`Initializing Y.js with room: ${roomCode}, user: ${userName}`);
    
    // Create Y.js doc
    ydoc = new Y.Doc();
    
    // Set up WebSocket connection with proper parameters
    const wsUrl = new URL('ws://localhost:1234');
    wsUrl.searchParams.set('username', userName);
    wsUrl.searchParams.set('room', roomCode);
    wsUrl.searchParams.set('type', 'awareness');
    wsUrl.searchParams.set('color', get().userColor); // Add this line
    wsUrl.pathname = `/${roomCode}`;
    
    console.log('Connecting to WebSocket:', wsUrl.toString());
    
    // Create provider
    provider = new WebsocketProvider(wsUrl.toString(), roomCode, ydoc);
    yStrokes = ydoc.getArray('strokes');
    yActiveStrokes = ydoc.getMap('activeStrokes'); // Add this
    awareness = provider.awareness;
    
    // Set client ID
    set({ clientID: ydoc.clientID });
    
    // Add the user to the active users list
    set((state) => ({
      activeUsers: [
        ...state.activeUsers,
        {
          clientID: ydoc.clientID,
          userName,
          color: get().userColor, 
        },
      ],
    }));

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

    // Handle WebSocket messages for user updates
    provider.ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);        
        if (message.type === 'active-users') {
          set({ activeUsers: message.users });
        }
      } catch (e) {
        // Ignore non-JSON messages (y-websocket protocol messages)
      }
    });

    // Remove awareness state update handler since we're using WebSocket messages          
    // Handle awareness changes
    awareness.on('change', () => {
      const states = Array.from(awareness.getStates());
      set({ awarenessStates: states });
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

    // Add observer for active strokes
    yActiveStrokes.observe(() => {
      const activeStrokes = Array.from(yActiveStrokes.entries())
        .filter(([clientId]) => clientId !== ydoc.clientID.toString())
        .map(([_, stroke]) => stroke);
      
      set({ remoteActiveStrokes: activeStrokes });
    });
  },
  
  // Clean up Y.js resources
  cleanupYjs: () => {
    if (yActiveStrokes) {
      yActiveStrokes.delete(ydoc?.clientID.toString());
    }
    if (provider) {
      provider.disconnect();
      provider = null;
    }
    if (ydoc) {
      const clientID = ydoc.clientID;
      set((state) => ({
        activeUsers: state.activeUsers.filter((user) => user.clientID !== clientID),
      }));
      ydoc.destroy();
      ydoc = null;
    }
    yStrokes = null;
    yActiveStrokes = null;
    awareness = null;
    set({ isConnected: false, clientID: null, activeUsers: [] });
  },
  
  // Get Y.js resources
  getYjsResources: () => ({
    ydoc,
    provider,
    yStrokes,
    yActiveStrokes,
    awareness
  }),
  
  updateAwareness: (state) => {
    if (awareness) {
      awareness.setLocalState({
        cursor: state.cursor,
        isDrawing: state.isDrawing,
        user: {
          id: state.user.id,
          name: state.user.name,
          color: state.penColor
        }
      });
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
  
  startLine: (point) => {
    const state = get();
    const newLine = {
      id: Date.now().toString(),
      clientID: ydoc?.clientID,
      points: [point],
      toolType: state.selectedTool,
      color: state.penColor,
      width: state.penSize
    };

    // Add to active strokes map
    if (yActiveStrokes) {
      yActiveStrokes.set(ydoc.clientID.toString(), newLine);
    }

    set({ currentLine: newLine, isDrawing: true });
  },
  
  updateLine: (point) => set(state => {
    if (!state.currentLine) return state;
    // Get the last point
    const lastPoint = state.currentLine.points[state.currentLine.points.length - 1];
    
    // If this is a hand tracking point, apply smoothing
    if (point.fromHandTracking) {
      point = drawingSmoothing(lastPoint, point, state.smoothingParams);
    }
    
    const updatedLine = {
      ...state.currentLine,
      points: [...state.currentLine.points, point]
    };

    // Update in active strokes map
    if (yActiveStrokes) {
      yActiveStrokes.set(ydoc.clientID.toString(), updatedLine);
    }

    return { currentLine: updatedLine };
  }),

  completeLine: () => {
    const state = get();
    if (!state.currentLine) return set({ isDrawing: false });
    
    // Remove from active strokes
    if (yActiveStrokes) {
      yActiveStrokes.delete(ydoc.clientID.toString());
    }

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
      isDrawing: false,
      undoStack: [...state.undoStack, state.currentLine], // Add to undoStack
      redoStack: [] // Clear redoStack when new stroke is drawn
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

    // Remove from local strokes
    state.localStrokes.delete(strokeToUndo.id);

    // Use Y.js transaction to ensure atomic updates
    if (yStrokes) {
      ydoc.transact(() => {
        // Find and remove the stroke from Y.js array
        const yStrokeIndex = yStrokes.toArray().findIndex(
          stroke => (Array.isArray(stroke) ? stroke[0] : stroke).id === strokeToUndo.id
        );
        if (yStrokeIndex !== -1) {
          yStrokes.delete(yStrokeIndex, 1);
        }
      });
    }
    
    // Update local state
    set(state => ({
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, strokeToUndo]
    }));

    // Force a redraw from Y.js state to ensure consistency
    const currentStrokes = yStrokes.toArray();
    get().clearBgCanvas();
    currentStrokes.forEach(strokeData => {
      const stroke = Array.isArray(strokeData) ? stroke[0] : strokeData;
      if (stroke && stroke.points) {
        get().drawStrokeOnBg(stroke);
      }
    });
  },

  redo: () => {
    const state = get();
    const currentClientID = ydoc?.clientID;
    
    // Find the most recent stroke by this client in the redo stack
    const strokeIndex = state.redoStack.findLastIndex(
      stroke => stroke.clientID === currentClientID
    );
    
    if (strokeIndex === -1) return;
    
    // Remove the stroke from redoStack
    const strokeToRedo = state.redoStack[strokeIndex];
    const newRedoStack = [
      ...state.redoStack.slice(0, strokeIndex),
      ...state.redoStack.slice(strokeIndex + 1)
    ];
    
    // Use Y.js transaction for atomic update
    if (yStrokes) {
      ydoc.transact(() => {
        yStrokes.push([strokeToRedo]);
      });
    }
    
    // Update local state
    set(state => ({
      redoStack: newRedoStack,
      undoStack: [...state.undoStack, strokeToRedo]
    }));

    // Force a redraw from Y.js state
    const currentStrokes = yStrokes.toArray();
    get().clearBgCanvas();
    currentStrokes.forEach(strokeData => {
      const stroke = Array.isArray(strokeData) ? stroke[0] : strokeData;
      if (stroke && stroke.points) {
        get().drawStrokeOnBg(stroke);
      }
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
  
  // Update render function in Canvas component to include active strokes
  renderCanvas: (ctx) => {
    const state = get();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw background with completed strokes
    if (state.bgCanvas) {
      ctx.drawImage(state.bgCanvas, 0, 0);
    }

    // Draw current local stroke
    if (state.currentLine) {
      state.renderStroke(state.currentLine, ctx);
    }

    // Draw remote active strokes
    state.remoteActiveStrokes.forEach(stroke => {
      state.renderStroke(stroke, ctx);
    });

    // Draw other users' cursors
    state.awarenessStates.forEach(([clientID, state]) => {
      if (state.cursor && clientID !== ydoc.clientID) {
        ctx.save();
        const dpr = window.devicePixelRatio || 1;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = state.isDrawing ? state.user.color : 'gray';
        ctx.beginPath();
        ctx.arc(state.cursor.x, state.cursor.y, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = '12px Arial';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 3;
        ctx.strokeText(state.user.name, state.cursor.x + 10, state.cursor.y + 10);
        ctx.fillText(state.user.name, state.cursor.x + 10, state.cursor.y + 10);
        ctx.restore();
      }
    });

    // Draw hand tracking cursor if enabled
    if (state.showCursor && state.cursorPosition) {
      ctx.save();
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = state.isDrawing ? state.penColor : 'gray';
      ctx.beginPath();
      ctx.arc(state.cursorPosition.x, state.cursorPosition.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
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