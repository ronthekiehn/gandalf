import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket';

const Canvas = () => {
  const [provider] = useState(() => {
    const ydoc = new Y.Doc();
    // Connect to the WebSocket server
    const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc);
    return provider;
  });

  const ydoc = provider.doc;
  const yStrokes = ydoc.getArray('strokes');
  const awareness = provider.awareness;

  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const strokeColorRef = useRef('black');
  const linewidthRef = useRef(3);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [strokes, setStrokes] = useState([]);
  const [useHandTracking, setUseHandTracking] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
  const [isHandReady, setIsHandReady] = useState(false);
  const prevPinchState = useRef(false);
  const currentStrokeRef = useRef([]);
  const cursorHistoryRef = useRef([]);
  const cursorHistorySize = 2;

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

    // Create background canvas
    const bgCanvas = document.createElement('canvas');
    bgCanvasRef.current = bgCanvas;
    const bgCtx = bgCanvas.getContext('2d');

    // Set canvas size to its parent container size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 70;
      bgCanvas.width = window.innerWidth;
      bgCanvas.height = window.innerHeight - 70;

      // Set drawing styles for both canvases
      [context, bgCtx].forEach(ctx => {
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

  useEffect(() => {
    if (!ctx) return;

    // Clear the main canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Draw the background canvas (contains all completed strokes)
    ctx.drawImage(bgCanvasRef.current, 0, 0);
    ctx.strokeStyle = strokeColorRef.current;
    // Only draw the current stroke on the main canvas
    if (currentStroke.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);

      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }

      ctx.stroke();
    }

    // Draw cursor if hand tracking is active
    if (showCursor && useHandTracking) {
      ctx.save();
      ctx.fillStyle = isDrawing ? strokeColorRef.current : 'gray';
      ctx.beginPath();
      ctx.arc(cursorPosition.x, cursorPosition.y, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    // Draw all users' cursors
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

  }, [ctx, currentStroke, cursorPosition, showCursor, isDrawing, useHandTracking, awareness]);

  const addStrokeToBackground = (stroke) => {
    const bgCtx = bgCanvasRef.current.getContext('2d');
    bgCtx.strokeStyle = strokeColorRef.current;
    bgCtx.lineWidth = linewidthRef.current;
    bgCtx.beginPath();
    bgCtx.moveTo(stroke[0].x, stroke[0].y);

    for (let i = 1; i < stroke.length; i++) {
      bgCtx.lineTo(stroke[i].x, stroke[i].y);
    }

    bgCtx.stroke();
  };

  // Chaikin Smoothing Algorithm
  const smoothStroke = (points, iterations = 12) => {
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

  const endDrawing = () => {
    if (!isDrawing || useHandTracking) return;
    if (currentStroke.length > 0) {
      const smoothedStroke = smoothStroke(currentStroke);
      addStrokeToBackground(smoothedStroke);
      setStrokes(prev => [...prev, smoothedStroke]);
      const newStroke = {
        id: crypto.randomUUID(),
        points: smoothedStroke,
        color: strokeColorRef.current,
        width: linewidthRef.current
      };
      yStrokes.push([newStroke]);
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

  const smoothCursorPosition = (newPosition) => {
    cursorHistoryRef.current.push(newPosition);
    if (cursorHistoryRef.current.length > cursorHistorySize) {
      cursorHistoryRef.current.shift();
    }

    // Calculate average position
    const smoothedPosition = cursorHistoryRef.current.reduce(
      (acc, pos) => ({
        x: acc.x + pos.x / cursorHistoryRef.current.length,
        y: acc.y + pos.y / cursorHistoryRef.current.length
      }),
      { x: 0, y: 0 }
    );

    return smoothedPosition;
  };

  // Handle hand tracking updates
  const handleHandUpdate = (handData) => {
    console.log('Current stroke:', currentStroke)
    if (!handData || !canvasRef.current) return;
    setIsHandReady(true);

    // Scale hand coordinates to canvas size
    const canvas = canvasRef.current;
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 480;

    // Flip X coordinate to mirror the hand movement
    const x = canvas.width - handData.position.x * scaleX;
    const y = handData.position.y * scaleY;

    // Apply smoothing to cursor position
    const smoothedPosition = smoothCursorPosition({ x, y });
    setCursorPosition(smoothedPosition);
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

      const maxDistance = 100;
      let shouldAddPoint = true;
      const threshold = 5;

      if (currentStrokeRef.current.length > 0) {
        const prevPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1];
        const distance = Math.sqrt(
          Math.pow(prevPoint.x - x, 2) + Math.pow(prevPoint.y - y, 2)
        );

        if (distance > maxDistance) {
          console.log(`Point rejected: distance ${distance.toFixed(2)} exceeds threshold ${maxDistance}`);
          shouldAddPoint = false;
        }
        if (distance < threshold) {
          console.log(`Point rejected: distance ${distance.toFixed(2)} is below threshold ${threshold}`);
          shouldAddPoint = false;
        }
      }

      if (shouldAddPoint) {
        setCurrentStroke(prev => [...prev, { x, y }]);
      }
    }
    // End drawing when unpinching
    else if (!isPinching && wasPinching) {
      console.log('Ending stroke with:', currentStrokeRef.current);
      if (currentStrokeRef.current.length > 0) {
        // Apply smoothing before adding to strokes array
        const smoothedStroke = smoothStroke(currentStrokeRef.current);
        addStrokeToBackground(smoothedStroke); // Add this line
        setStrokes(prev => [...prev, smoothedStroke]);
        const newStroke = {
          id: crypto.randomUUID(),
          points: smoothedStroke,
          color: strokeColorRef.current,
          width: linewidthRef.current
        };
        yStrokes.push([smoothedStroke]); // Sync to Yjs

      }
      setCurrentStroke([]);
      setIsDrawing(false);
    }

    prevPinchState.current = isPinching;
  };

  const interpolatePoints = (start, end, numPoints = 5) => {
    const points = [];
    const deltaX = (end.x - start.x) / numPoints;
    const deltaY = (end.y - start.y) / numPoints;

    for (let i = 1; i <= numPoints; i++) {
      points.push({
        x: start.x + deltaX * i,
        y: start.y + deltaY * i,
      });
    }

    return points;
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
    const bgCtx = bgCanvasRef.current.getContext('2d');
    bgCtx.clearRect(0, 0, bgCanvasRef.current.width, bgCanvasRef.current.height);
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
      {/* Color Buttons */}
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