import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import AdvancedFeatures from './AdvancedFeatures';
import Toolbar from './Toolbar';
import useWhiteboardStore from '../stores/whiteboardStore';
import useUIStore from '../stores/uiStore';

const Canvas = ({ roomCode }) => {
  const [userName, setUserName] = useState(() => {
    const savedName = localStorage.getItem('wb-username');
    return savedName || `User-${Math.floor(Math.random() * 1000)}`;
  });

  // Get store methods and state
  const store = useWhiteboardStore();
  
  // Initialize Y.js connection
  useEffect(() => {
    store.initializeYjs(roomCode, userName);
    
    // Clean up Y.js resources on unmount
    return () => store.cleanupYjs();
  }, [roomCode, userName]);
  
  // Get Y.js-related resources from store for AdvancedFeatures
  const { provider, awareness } = store.getYjsResources();

  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);

  const linewidthRef = useRef(3);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const { useHandTracking, darkMode } = useUIStore();
  const [isHandReady, setIsHandReady] = useState(false);
  const prevPinchState = useRef(false);
  const currentStrokeRef = useRef([]);
  const cursorHistoryRef = useRef([]);
  const cursorHistorySize = 1;
  const wasClickingRef = useRef(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (darkMode) {
      // If currently using black, switch to white
      if (store.color === 'black') {
        store.setColor('white');
      }
    } else {
      // If currently using white, switch to black
      if (store.color === 'white') {
        store.setColor('black');
      }
    }
  }, [darkMode]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 48;
    store.setBgCanvas(canvas);
    bgCanvasRef.current = canvas;
  }, []);

  useEffect(() => {
    const setupCanvas = (canvas, context) => {
      const width = window.innerWidth;
      const height = window.innerHeight - 48;
      const dpr = window.devicePixelRatio || 1;
      
      // Reset any previous transforms
      context.setTransform(1, 0, 0, 1, 0, 0);
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      

      // Set up drawing settings
      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = linewidthRef.current;
      context.strokeStyle = store.color;
    };

    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    const context = canvas.getContext('2d');
    const bgContext = bgCanvas.getContext('2d');

    const resizeCanvas = () => {
      setupCanvas(canvas, context);
      setupCanvas(bgCanvas, bgContext);
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
    if (!useHandTracking) return;
    cursorPositionRef.current = store.cursorPosition;
  }, [store.cursorPosition]);


  useEffect(() => {
    if (!ctx || !bgCanvasRef.current) return;

    const renderCanvas = () => {
      const currentState = useWhiteboardStore.getState();
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(bgCanvasRef.current, 0, 0);
      if (currentState.currentLine) {
        store.renderStroke(currentState.currentLine, ctx);
      }

      // Draw other users' cursors using the current state snapshot
      currentState.awarenessStates.forEach(([clientID, state]) => {
        if (state.cursor && clientID !== currentState.clientID) {
          console.log("here")
          ctx.save();
          const dpr = window.devicePixelRatio || 1;
          ctx.scale(dpr, dpr);

          ctx.fillStyle = state.isDrawing ? state.user.color : 'gray';
          ctx.beginPath();
          ctx.arc(state.cursor.x, state.cursor.y, 10, 0, 2 * Math.PI);
          ctx.fill();


          ctx.font = '14px Arial';
          ctx.fillStyle = 'white';
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 3;
          ctx.strokeText(state.user.name, state.cursor.x + 15, state.cursor.y + 15);
          ctx.fillText(state.user.name, state.cursor.x + 15, state.cursor.y + 15);

          ctx.restore();
        }
      });

      if (currentState.showCursor && useHandTracking) {
        ctx.save();
        const dpr = window.devicePixelRatio || 1;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = currentState.isDrawing ? store.color : 'gray';
        ctx.beginPath();
        ctx.arc(cursorPositionRef.current.x, cursorPositionRef.current.y, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    };

    const animationFrame = requestAnimationFrame(function loop() {
      renderCanvas();
      requestAnimationFrame(loop);
    });

    // Set up initial state
    store.setupCanvasSync();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [ctx, useHandTracking]);

  // Add this ref to track latest state
  const currentLineRef = useRef(store.currentLine);
  const cursorPositionRef = useRef(store.cursorPosition);

  // Update ref when state changes
  useEffect(() => {
    currentLineRef.current = store.currentLine;
  }, [store.currentLine]);

  const startDrawing = (e) => {
    if (useHandTracking) return;
    const point = getPointerPosition(e);
    store.startLine(point);
  };

  const draw = (e) => {
    if (!store.isDrawing || useHandTracking) return;
    const point = getPointerPosition(e);
    store.updateLine(point);
  };

  const endDrawing = () => {
    if (!store.isDrawing || useHandTracking) return;
    if (store.currentLine && store.currentLine.points.length > 0) {
      store.completeLine();
    }
  };

  const getPointerPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    return { x, y };
  };

  const smoothCursorPosition = (newPosition) => {

    if (cursorHistoryRef.current.length === 0) {
      cursorHistoryRef.current.push(newPosition);
      return newPosition;
    }
    const lastPos = cursorHistoryRef.current[cursorHistoryRef.current.length - 1];

    const newAvg = [...cursorHistoryRef.current, newPosition]
    // Accumulate the total x and y values
    const smoothedPosition = newAvg.reduce(
      (acc, pos) => ({
        x: acc.x + pos.x,
        y: acc.y + pos.y
      }),
      { x: 0, y: 0 }
    );

    // Divide by the length of the array to get the average
    smoothedPosition.x /= newAvg.length;
    smoothedPosition.y /= newAvg.length;

    // if the new position is less than 2 pixels away from the previous position, return the previous position
    if (Math.abs(smoothedPosition.x - lastPos.x) < 2){
      smoothedPosition.x = lastPos.x;
    }
    if (Math.abs(smoothedPosition.y - lastPos.y) < 2) {
      smoothedPosition.y = lastPos.y;
    }
    // Limit the size of the cursor history
    if (cursorHistoryRef.current.length >= cursorHistorySize) {
      cursorHistoryRef.current.shift(); 
    }
    cursorHistoryRef.current.push(smoothedPosition);
    return smoothedPosition;
};

  const handleHandUpdate = (handData) => {
    if (!handData || !canvasRef.current) return;
    setIsHandReady(true);

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Calculate scale factors considering both canvas size and DPR
    const scaleX = (canvas.width / dpr) / 640;  // 640 is the video width
    const scaleY = (canvas.height / dpr) / 480;  // 480 is the video height

    // Mirror the x coordinate and scale it
    const rawX = (canvas.width / dpr) - (handData.position.x * scaleX);
    const rawY = handData.position.y * scaleY;
    
    // Convert to canvas coordinates
    const x = rawX - rect.left;
    const y = rawY - rect.top;

    const smoothedPosition = smoothCursorPosition({ x, y });

    store.updateCursorPosition(smoothedPosition);
    store.setShowCursor(true);

    const isPinching = handData.isPinching;
    const isFist = handData.isFist;
    const isClicking = handData.isClicking;
    const isGen = false;

    if (isFist) {
      clearCanvas();
      return;
    }

    if (!isClicking && wasClickingRef.current) {
      store.cycleColor();
    }
    wasClickingRef.current = isClicking;

    if (isGen && !isGenerating) {
      generateImage();
    }
    if (isPinching && !prevPinchState.current) {
      store.startLine(smoothedPosition);

    } else if (isPinching && prevPinchState.current) {
      store.updateLine({...smoothedPosition,  fromHandTracking: true });
    } else if (!isPinching && prevPinchState.current) {
      if (currentLineRef.current && currentLineRef.current.points.length > 0) {
        store.completeLine();
      }
    }

    prevPinchState.current = isPinching;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!useHandTracking) { 
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update awareness with mouse position
        store.updateAwareness({
          cursor: { x, y },
          isDrawing: store.isDrawing,
          user: {
            id: store.clientID,
            name: userName,
            color: store.color
          }
        });
      }
    };

    const handleMouseLeave = () => {
      if (!useHandTracking) {
        store.clearAwareness();
      }
    };

    if (canvasRef.current) {
      canvasRef.current.addEventListener('mousemove', handleMouseMove);
      canvasRef.current.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [store.isDrawing, useHandTracking, userName, store.clientID]);

  useEffect(() => {
    const updateLocalAwareness = () => {
      if (useHandTracking && isHandReady) {
        store.updateAwareness({
          cursor: store.cursorPosition,
          isDrawing: store.isDrawing,
          user: {
            id: store.clientID,
            name: userName,
            color: store.color
          }
        });
      }
    };

    updateLocalAwareness();
  }, [awareness, store.cursorPosition, isHandReady, useHandTracking, store.isDrawing, userName, store.clientID]);


  const clearCanvas = () => {
    store.clearCanvas();
  };

  const generateImage = async () => {
    if (!canvasRef.current) return;
    setIsGenerating(true);

    try {
      // Get all strokes from the store
      const allStrokes = store.getStrokesForExport();

      const response = await fetch('https://ws.ronkiehn.dev/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strokes: allStrokes,
          prompt: "Enhance and refine this sketch while maintaining its core elements and shapes.",
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();

      if (result.images?.length) {
        setGeneratedImages(prev => [
          ...prev,
          ...result.images.map(img => ({
            src: `data:${img.mimeType};base64,${img.data}`,
            alt: 'AI Generated artwork',
            timestamp: Date.now()
          }))
        ]);
      } else {
        throw new Error('No images generated');
      }
    } catch (error) {
      console.error('Generation failed:', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteGeneratedImage = (timestamp) => {
    setGeneratedImages(prev => prev.filter(img => img.timestamp !== timestamp));
  };

  return (
    <div className={`h-full w-full flex justify-center ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      <Toolbar />

      <div className='absolute top-2 right-4 hidden sm:flex gap-2 items-center'>
        {store.awarenessStates
          .filter(([_, state]) => state?.user?.name && state?.user?.color)
          .map(([clientID, state]) => (
            <p
              key={clientID}
              className="text-white text-sm flex justify-center items-center p-1 w-6 h-6 text-center rounded-full shadow-sm"
              style={{ backgroundColor: state.user.color }}
            >
              {state.user.name.charAt(0)}
            </p>
          ))}
      </div>

      <div className={`absolute top-12 right-4 p-2 px-4 pb-4 pt-5 rounded-xl shadow-md border flex flex-col gap-4 ${
        darkMode
          ? 'bg-gray-200 text-gray-800 border-gray-300 shadow-gray-900'
          : 'bg-white text-black border-gray-200 shadow-neutral-300'
      }`}>
        <input
          type="text"
          value={userName}
          onChange={(e) => {
            const newName = e.target.value;
            setUserName(newName);
            localStorage.setItem('wb-username', newName);
          }}
          className={`text-center p-2 border rounded shadow-sm ${
            darkMode
              ? 'bg-white text-gray-800 border-gray-300'
              : 'bg-white text-black border-gray-200'
          }`}
          placeholder="name"
        />

        <button
          className="text-black p-2 w-full rounded-full bg-gray-100 hover:-translate-y-0.5 transition-all duration-200 ease-in-out hover:shadow-lg cursor-pointer"
          onClick={generateImage}
          disabled={isGenerating}
        >
          {isGenerating ? '⏳ Generating...' : 'Improve Image ✨'}
        </button>

        <AdvancedFeatures
          canvasRef={canvasRef}
          bgCanvasRef={bgCanvasRef}
          ydoc={store.getYjsResources().ydoc}
          awareness={awareness}
        />
      </div>

      <canvas
        ref={canvasRef}
        className={`w-full h-full ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
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

      {generatedImages.length > 0 && (
        <div className={`fixed bottom-4 left-4 p-4 rounded-lg shadow-lg max-w-[80vw] ${
          darkMode ? 'bg-gray-800/95 text-white' : 'bg-white/95 text-black'
        }`}>
          <h3 className="font-bold mb-2">Generated Images</h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {generatedImages.map((img) => (
              <div key={img.timestamp} className="relative group">
                <button
                  onClick={() => deleteGeneratedImage(img.timestamp)}
                  className="absolute top-2 left-2 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                  title="Delete image"
                >
                  ×
                </button>
                <img
                  src={img.src}
                  alt={img.alt}
                  className={`h-48 w-48 object-contain rounded-lg border-2 ${
                    darkMode ? 'border-gray-600' : 'border-gray-200'
                  }`}
                />
                <a
                  href={img.src}
                  download={`generated-${img.timestamp}.png`}
                  className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Download image"
                >
                  ⬇️
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;