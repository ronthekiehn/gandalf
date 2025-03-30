import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket';

const Canvas = () => {
  const [provider] = useState(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider('ws://10.150.155.65:1234', 'my-room', ydoc);
    return provider;
  });

  const ydoc = provider.doc;
  const yStrokes = ydoc.getArray('strokes');
  const awareness = provider.awareness;

  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const [bgCanvas] = useState(() => {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 70;
    return canvas;
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const strokeColorRef = useRef('black');
  const linewidthRef = useRef(3);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [useHandTracking, setUseHandTracking] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [isHandReady, setIsHandReady] = useState(false);
  const prevPinchState = useRef(false);
  const currentStrokeRef = useRef([]);
  const cursorHistoryRef = useRef([]);
  const cursorHistorySize = 2;

  useEffect(() => {
    bgCanvasRef.current = bgCanvas;
  }, [bgCanvas]);

  useEffect(() => {
    const updateLocalAwareness = () => {
      if (useHandTracking && isHandReady) {
        awareness.setLocalState({
          cursor: cursorPosition,
          isDrawing,
          user: crypto.randomUUID()
        });
      } else {
        awareness.setLocalState({
          cursor: { x: MouseEvent.x || cursorPosition.x, y: MouseEvent.y || cursorPosition.y },
          isDrawing,
          user: crypto.randomUUID()
        });
      }
    };

    updateLocalAwareness();
    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness, cursorPosition, isHandReady, useHandTracking, isDrawing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const resizeCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight - 70;
      
      canvas.width = width;
      canvas.height = height;
      
      bgCanvasRef.current.width = width;
      bgCanvasRef.current.height = height;

      [context, bgCanvasRef.current.getContext('2d')].forEach(ctx => {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = linewidthRef.current;
        ctx.strokeStyle = strokeColorRef.current;
      });
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setCtx(context);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    currentStrokeRef.current = currentStroke;
  }, [currentStroke]);

  // Add this effect to handle both drawing and synchronization
useEffect(() => {
  if (!ctx || !bgCanvasRef.current) return;

  // Drawing function that works for both local and remote strokes
  const renderStroke = (stroke, targetCtx) => {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    
    targetCtx.save();
    targetCtx.strokeStyle = stroke.color || 'black';
    targetCtx.lineWidth = stroke.width || linewidthRef.current;
    targetCtx.beginPath();
    targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      targetCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    
    targetCtx.stroke();
    targetCtx.restore();
  };

  // Load existing strokes from Yjs (happens once on connect)
  const loadExistingStrokes = () => {
    const bgCtx = bgCanvasRef.current.getContext('2d');
    bgCtx.clearRect(0, 0, bgCtx.canvas.width, bgCtx.canvas.height);
    
    yStrokes.forEach(item => {
      const stroke = Array.isArray(item) ? item[0] : item;
      renderStroke(stroke, bgCtx);
    });
  };

  const handleStrokeAdded = (event) => {
    const bgCtx = bgCanvasRef.current.getContext('2d');
    
    event.changes.added.forEach(item => {
      // This is the correct way to iterate through Y.js changes
      let content;
      if (item.content && item.content.getContent) {
        content = item.content.getContent();
      } else if (Array.isArray(item.content)) {
        content = item.content;
      } else {
        console.warn("Unexpected content format:", item.content);
        return;
      }
      
      // Iterate through the content
      for (let i = 0; i < content.length; i++) {
        const strokeData = content[i];
        const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
        if (stroke && stroke.points) {
          renderStroke(stroke, bgCtx);
        }
      }
    });
  };

  // Main rendering loop for the foreground canvas
  const renderCanvas = () => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(bgCanvasRef.current, 0, 0);
    
    // Draw current stroke (if any)
    if (currentStroke.length > 0) {
      const tempStroke = {
        points: currentStroke,
        color: strokeColorRef.current,
        width: linewidthRef.current
      };
      renderStroke(tempStroke, ctx);
    }

    // Draw cursors
    awareness.getStates().forEach((state, clientID) => {
      if (state.cursor && clientID !== ydoc.clientID) {
        ctx.save();
        ctx.fillStyle = state.isDrawing ? strokeColorRef.current : 'gray';
        ctx.beginPath();
        ctx.arc(state.cursor.x, state.cursor.y, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw own cursor if using hand tracking
    if (showCursor && useHandTracking) {
      ctx.save();
      ctx.fillStyle = isDrawing ? strokeColorRef.current : 'gray';
      ctx.beginPath();
      ctx.arc(cursorPosition.x, cursorPosition.y, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  };

  // Set up render loop
  const animationFrame = requestAnimationFrame(function loop() {
    renderCanvas();
    requestAnimationFrame(loop);
  });

  // Set up Yjs observers
  yStrokes.observe(handleStrokeAdded);
  provider.on('sync', loadExistingStrokes);
  
  // Try once on mount in case we're already connected
  loadExistingStrokes();

  return () => {
    yStrokes.unobserve(handleStrokeAdded);
    provider.off('sync', loadExistingStrokes);
    cancelAnimationFrame(animationFrame);
  };
}, [ctx, currentStroke, cursorPosition, showCursor, isDrawing, useHandTracking, awareness, yStrokes, provider, ydoc.clientID]);


const addStrokeToBackground = (stroke) => {
  const smoothedStroke = smoothStroke(stroke);
  const newStroke = {
    id: crypto.randomUUID(),
    points: smoothedStroke,
    color: strokeColorRef.current,
    width: linewidthRef.current
  };
  
  // Add to Yjs - the observer will automatically render it
  yStrokes.push([newStroke]);
  
  return smoothedStroke;
};

  const smoothStroke = (points, iterations = 12) => {
    return points;
    if (points.length < 2) return points;

    let smoothed = points;
    for (let iter = 0; iter < iterations; iter++) {
      const newPoints = [];
      newPoints.push(smoothed[0]);
      for (let i = 0; i < smoothed.length - 1; i++) {
        const p0 = smoothed[i];
        const p1 = smoothed[i + 1];
        newPoints.push({
          x: p0.x * 0.5 + p1.x * 0.5,
          y: p0.y * 0.5 + p1.y * 0.5
        });
        newPoints.push({
          x: p0.x * 0.5 + p1.x * 0.5,
          y: p0.y * 0.5 + p1.y * 0.5
        });
      }
      newPoints.push(smoothed[smoothed.length - 1]);
      smoothed = newPoints;
    }
    return smoothed;
  };

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

  const compressStroke = (points) => {
    if (points.length <= 2) return points;
    
    const tolerance = 2; // Adjust based on desired compression level
    const result = [points[0]]; // Always keep the first point
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const current = points[i];
      const next = points[i + 1];
      
      // Calculate if the current point significantly deviates from a straight line
      const dx1 = current.x - prev.x;
      const dy1 = current.y - prev.y;
      const dx2 = next.x - current.x;
      const dy2 = next.y - current.y;
      
      // Calculate angle change
      const angle1 = Math.atan2(dy1, dx1);
      const angle2 = Math.atan2(dy2, dx2);
      const angleDiff = Math.abs(angle1 - angle2);
      
      // Keep points where direction changes significantly
      if (angleDiff > tolerance * 0.1 || 
          Math.sqrt(dx1*dx1 + dy1*dy1) > tolerance * 5) {
        result.push(current);
      }
    }
    
    result.push(points[points.length - 1]); // Always keep the last point
    return result;
  }
  
  const endDrawing = () => {
    if (!isDrawing || useHandTracking) return;
    if (currentStrokeRef.current.length > 0) {
      const compressedStroke = compressStroke(currentStrokeRef.current);
      addStrokeToBackground(compressedStroke);
    }
    
    setCurrentStroke([]);
    currentStrokeRef.current = [];
    setIsDrawing(false);
  };

  const getPointerPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    return { x, y };
  };

  const smoothCursorPosition = (newPosition) => {
    cursorHistoryRef.current.push(newPosition);
    if (cursorHistoryRef.current.length > cursorHistorySize) {
      cursorHistoryRef.current.shift();
    }

    const smoothedPosition = cursorHistoryRef.current.reduce(
      (acc, pos) => ({
        x: acc.x + pos.x / cursorHistoryRef.current.length,
        y: acc.y + pos.y / cursorHistoryRef.current.length
      }),
      { x: 0, y: 0 }
    );
    return smoothedPosition;
  };

  const handleHandUpdate = (handData) => {
    if (!handData || !canvasRef.current) return;
    setIsHandReady(true);

    const canvas = canvasRef.current;
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;
    const x = canvas.width - handData.position.x * scaleX;
    const y = handData.position.y * scaleY;

    const smoothedPosition = smoothCursorPosition({ x, y });
    setCursorPosition(smoothedPosition);
    setShowCursor(true);

    const isPinching = handData.isPinching;
    const wasPinching = prevPinchState.current;

    if (isPinching && !wasPinching) {
      setIsDrawing(true);
      setCurrentStroke([{ x, y }]);
    }
    else if (isPinching && wasPinching) {
      const maxDistance = 100;
      let shouldAddPoint = true;
      const threshold = 5;

      if (currentStrokeRef.current.length > 0) {
        const prevPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1];
        const distance = Math.sqrt(
          Math.pow(prevPoint.x - x, 2) + Math.pow(prevPoint.y - y, 2)
        );

        if (distance > maxDistance || distance < threshold) {
          shouldAddPoint = false;
        }
      }

      if (shouldAddPoint) {
        setCurrentStroke(prev => [...prev, { x, y }]);
      }
    }
    else if (!isPinching && wasPinching) {
      if (currentStrokeRef.current.length > 0) {
        const compressedStroke = compressStroke(currentStrokeRef.current);
        addStrokeToBackground(compressedStroke);
      }
      
      setCurrentStroke([]);
      setIsDrawing(false);
    }
    prevPinchState.current = isPinching;
  };

  const toggleHandTracking = () => {
    setUseHandTracking(prev => !prev);
    setIsDrawing(false);
    setCurrentStroke([]);
    setShowCursor(false);
  };

  const clearCanvas = () => {
    ydoc.transact(() => {
      yStrokes.delete(0, yStrokes.length);
    });
    
    const bgCtx = bgCanvasRef.current.getContext('2d');
    bgCtx.clearRect(0, 0, bgCanvasRef.current.width, bgCanvasRef.current.height);
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
      <div className="slider-container">
        <label htmlFor="linewidth" className="text-sm text-gray-700">Line Width: </label>
        <input
          type="range"
          id="linewidth"
          name="linewidth"
          min="2"
          max="10"
          value={linewidthRef.current}
          onChange={(e) => {
            const newWidth = Math.max(2, Math.min(10, parseInt(e.target.value)));
            linewidthRef.current = newWidth;
            setCtx((prevCtx) => {
              if (prevCtx) {
                prevCtx.lineWidth = newWidth;
              }
              return prevCtx;
            });
          }}
          className="w-full"
          style={{
            background: `linear-gradient(to right, #000000 0%, #000000 ${linewidthRef.current / 10 * 100}%, #ccc ${linewidthRef.current / 10 * 100}%, #ccc 100%)`
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          className="w-10 h-10 rounded-full bg-black shadow-lg hover:opacity-80"
          onClick={() => (strokeColorRef.current = 'black')}
          aria-label="Black"
        ></button>
        <button
          className="w-10 h-10 rounded-full bg-red-600 shadow-lg hover:opacity-80"
          onClick={() => (strokeColorRef.current = 'red')}
          aria-label="Red"
        ></button>
        <button
          className="w-10 h-10 rounded-full bg-blue-600 shadow-lg hover:opacity-80"
          onClick={() => (strokeColorRef.current = 'blue')}
          aria-label="Blue"
        />
        <button
          className="w-10 h-10 rounded-full bg-green-600 shadow-lg hover:opacity-80"
          onClick={() => (strokeColorRef.current = 'green')}
          aria-label="Green"
        />
      </div>
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