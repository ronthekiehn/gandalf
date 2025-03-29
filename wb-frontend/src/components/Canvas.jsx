import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const Canvas = () => {
  // Create Yjs document and provider
  const [provider] = useState(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider('ws://10.150.7.104:1234', 'my-room', ydoc);
    return provider;
  });

  const ydoc = provider.doc;
  const yStrokes = ydoc.getArray('strokes');
  const awareness = provider.awareness;

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [useHandTracking, setUseHandTracking] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [isHandReady, setIsHandReady] = useState(false);
  const prevPinchState = useRef(false);

  // Set up Yjs awareness
  useEffect(() => {
    const updateLocalAwareness = () => {
      if (useHandTracking && isHandReady) {
        awareness.setLocalState({
          cursor: cursorPosition,
          isDrawing,
          user: crypto.randomUUID() // In real app, use actual user ID
        });
      } else {
        awareness.setLocalState(null);
      }
    };

    updateLocalAwareness();
    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness, cursorPosition, isHandReady, useHandTracking, isDrawing]);

  // Sync with Yjs strokes
  useEffect(() => {
    const handleStrokesUpdate = () => {
      setStrokes(yStrokes.toArray());
    };

    // Initial sync
    setStrokes(yStrokes.toArray());
    
    // Listen for changes
    yStrokes.observe(handleStrokesUpdate);
    
    return () => {
      yStrokes.unobserve(handleStrokesUpdate);
    };
  }, [yStrokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Set canvas size to its parent container size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 70; // Adjust for header/footer
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = 3;
      context.strokeStyle = 'black';
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setCtx(context);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  // Modify the drawing effect to include other users' cursors
  useEffect(() => {
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw all completed strokes
    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      
      ctx.stroke();
    });
    
    // Draw current stroke
    if (currentStroke.length > 1) {
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 3;
      
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      
      ctx.stroke();
    }
    
    // Draw all users' cursors
    awareness.getStates().forEach((state, clientID) => {
      if (state.cursor && clientID !== ydoc.clientID) {
        ctx.save();
        ctx.fillStyle = state.isDrawing ? 'red' : 'blue';
        ctx.beginPath();
        ctx.arc(state.cursor.x, state.cursor.y, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    });
    
    // Draw local cursor if hand tracking is active
    if (showCursor && useHandTracking) {
      ctx.save();
      ctx.fillStyle = isDrawing ? 'red' : 'blue';
      ctx.beginPath();
      ctx.arc(cursorPosition.x, cursorPosition.y, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, strokes, currentStroke, cursorPosition, showCursor, isDrawing, useHandTracking, awareness]);

  const startDrawing = (e) => {
    if (useHandTracking) return;
    setIsDrawing(true);
    const point = getPointerPosition(e);
    setCurrentStroke([point]);
  };
  
  const draw = (e) => {
    if (!isDrawing || useHandTracking) return;
    const point = getPointerPosition(e);
    setCurrentStroke(prev => [...prev, point]);
  };

  // Modify endDrawing to sync with Yjs
  const endDrawing = () => {
    if (!isDrawing || useHandTracking) return;
    
    if (currentStroke.length > 1) {
      const newStroke = { 
        id: crypto.randomUUID(), 
        points: currentStroke, 
        color: 'black', 
        width: 3 
      };
      yStrokes.push([newStroke]); // Sync to Yjs
    }
    setCurrentStroke([]);
    setIsDrawing(false);
  };

  const getPointerPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    return { x, y };
  };
  
  // Modify handleHandUpdate to sync with Yjs
  const handleHandUpdate = (handData) => {
    if (!handData || !canvasRef.current) return;
    setIsHandReady(true);
    
    // Scale hand coordinates to canvas size
    const canvas = canvasRef.current;
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;
    
    // Flip X coordinate to mirror the hand movement
    const x = canvas.width - handData.position.x * scaleX;
    const y = handData.position.y * scaleY;
    
    setCursorPosition({ x, y });
    setShowCursor(true);
    
    // Detect change in pinch state
    const isPinching = handData.isPinching;
    const wasPinching = prevPinchState.current;
    
    console.log('Hand state:', { isPinching, wasPinching, x, y }); // Debug log
    
    // Start drawing on pinch
    if (isPinching && !wasPinching) {
      console.log('Starting stroke'); // Debug log
      setIsDrawing(true);
      setCurrentStroke([{ x, y }]);
    } 
    // Continue drawing while pinching
    else if (isPinching && wasPinching) {
      console.log('Adding to stroke'); // Debug log
      setCurrentStroke(prev => [...prev, { x, y }]);
    } 
    // End drawing when unpinching
    else if (!isPinching && wasPinching) {
      console.log('Ending stroke');
      if (currentStroke.length > 1) {
        const newStroke = { 
          id: crypto.randomUUID(), 
          points: currentStroke, 
          color: 'black', 
          width: 3 
        };
        yStrokes.push([newStroke]); // Sync to Yjs
      }
      setCurrentStroke([]);
      setIsDrawing(false);
    }
    
    prevPinchState.current = isPinching;
  };
  
  // Toggle between mouse/touch and hand tracking modes
  const toggleHandTracking = () => {
    setUseHandTracking(prev => !prev);
    setIsDrawing(false);
    setCurrentStroke([]);
    setShowCursor(false);
  };
  
  // Clear all strokes
  const clearCanvas = () => {
    setStrokes([]);
    setCurrentStroke([]);
    setIsDrawing(false);
  };

  return (
    <>
     <div className="absolute top-0 right-4 flex flex-col gap-2">
        <button 
          className="bg-blue-600 text-white p-2 rounded-full shadow-lg hover:bg-blue-700"
          onClick={toggleHandTracking}
        >
          {useHandTracking ? '✋ Hand Mode ON' : '🖱️ Mouse Mode'}
        </button>
        
        <button 
          className="bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700"
          onClick={clearCanvas}
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-full bg-white"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
      />
      
      {useHandTracking && <HandTracking onHandUpdate={handleHandUpdate} />}
      

      {useHandTracking && !isHandReady && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white p-4 rounded-md z-50">
          <p className="text-center">Please allow camera access and wait for the hand tracking model to load...</p>
        </div>
      )}
    </>
  );
};

export default Canvas;
