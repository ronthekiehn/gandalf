import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import AdvancedFeatures from './AdvancedFeatures';
import { DarkModeContext } from '../contexts/DarkModeContext';
import { X, Mouse, Hand, Type , Eraser } from 'lucide-react';
import useWhiteboardStore from '../stores/whiteboardStore';

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

  const strokeColorRef = useRef('black');
  const linewidthRef = useRef(3);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [useHandTracking, setUseHandTracking] = useState(false);
  const [isHandReady, setIsHandReady] = useState(false);
  const [textboxes, setTextboxes] = useState([]);
  const [selectedTextbox, setSelectedTextbox] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const prevPinchState = useRef(false);
  const currentStrokeRef = useRef([]);
  const cursorHistoryRef = useRef([]);
  const cursorHistorySize = 1;
  const wasClickingRef = useRef(false);
  const [darkMode, setDarkMode] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [colors, setColors] = useState(['black', 'red', 'blue', 'green']);
  const [currentColorIndex, setCurrentColorIndex] = useState(0);

  const cycleColor = () => {
    setCurrentColorIndex(prevIndex => {
      const newIndex = (prevIndex + 1) % colors.length;
      strokeColorRef.current = colors[newIndex];
      store.setColor(colors[newIndex]);
      return newIndex;
    });
  };

  useEffect(() => {
    if (darkMode) {
      setColors(['white', 'red', 'blue', 'green']);

      // If currently using black, switch to white
      if (strokeColorRef.current === 'black') {
        strokeColorRef.current = 'white';
      }
    } else {
      setColors(['black', 'red', 'blue', 'green']);

      // If currently using white, switch to black
      if (strokeColorRef.current === 'white') {
        strokeColorRef.current = 'black';
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
      context.strokeStyle = strokeColorRef.current;
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
        ctx.fillStyle = currentState.isDrawing ? strokeColorRef.current : 'gray';
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

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && selectedTextbox !== null) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;

        setTextboxes(boxes => boxes.map((box, i) =>
          i === selectedTextbox
            ? {
                ...box,
                x: box.x + dx,
                y: box.y + dy
              }
            : box
        ));

        dragStartPos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, selectedTextbox]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizing && selectedTextbox !== null) {
        const dx = e.clientX - resizeStartPos.current.x;
        const dy = e.clientY - resizeStartPos.current.y;

        setTextboxes(boxes => boxes.map((box, i) =>
          i === selectedTextbox
            ? {
                ...box,
                width: Math.max(200, resizeStartPos.current.width + dx),
                height: Math.max(40, resizeStartPos.current.height + dy)
              }
            : box
        ));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, selectedTextbox]);

  const addTextbox = () => {
    const centerX = canvasRef.current.width / 2;
    const centerY = canvasRef.current.height / 2;

    setTextboxes(prev => [...prev, {
      id: crypto.randomUUID(),
      x: centerX - 100,
      y: centerY - 20,
      text: '',
      color: strokeColorRef.current,
      width: 200,
      height: 40
    }]);
  };

  const deleteTextbox = (index) => {
    setTextboxes(prev => prev.filter((_, i) => i !== index));
    setSelectedTextbox(null);
  };

  const handleResizeStart = (e, index) => {
    e.stopPropagation();
    setSelectedTextbox(index);
    setIsResizing(true);
    const box = textboxes[index];
    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: box.width,
      height: box.height
    };
  };

  const handleTextboxClick = (e, index) => {
    e.stopPropagation();
    setSelectedTextbox(index);
  };

  const handleTextboxDragStart = (e, index) => {
    e.stopPropagation();
    setSelectedTextbox(index);
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

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
      cycleColor();
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
            color: strokeColorRef.current
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
            color: strokeColorRef.current
          }
        });
      }
    };

    updateLocalAwareness();
  }, [awareness, store.cursorPosition, isHandReady, useHandTracking, store.isDrawing, userName, store.clientID]);


  const toggleHandTracking = () => {
    setUseHandTracking(prev => !prev);
    store.setIsDrawing(false);
    setCurrentStroke([]);
    store.setShowCrsor(false);
  };

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
    <DarkModeContext.Provider value={{ darkMode, setDarkMode }}>
      <div className={`h-full w-full flex justify-center ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      <div className={`absolute bottom-4 px-3 py-2 flex gap-4 justify-between items-center shadow-lg rounded-2xl shadow-neutral-500 border ${
        darkMode
          ? 'bg-gray-200 text-gray-800 border-gray-300'
          : 'bg-white text-black border-stone-300'
      }`}>
        <button
          className={`cursor-pointer p-2 rounded-full transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          }`}
          onClick={toggleHandTracking}
        >
          {useHandTracking ? <Hand /> : <Mouse />}
        </button>

        <div className="flex gap-2">
          {colors.map((color, index) => (
            <button
              key={color}
              className={`cursor-pointer w-6 h-6 rounded-full transition-all ${
                index === currentColorIndex
                  ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                  : 'opacity-60 hover:opacity-100'
              } ${darkMode ? 'ring-offset-gray-800' : 'ring-offset-white'}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                strokeColorRef.current = color;
                setCurrentColorIndex(index);
                store.setColor(color);
              }}
              aria-label={color}
            />
          ))}

          {/* Add Eraser Button */}
          <button
            className={`cursor-pointer w-6 h-6 rounded-full transition-all flex items-center justify-center ${
              (darkMode && strokeColorRef.current === '#111827') || (!darkMode && strokeColorRef.current === 'white')
                ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                : 'opacity-60 hover:opacity-100'
            } ${darkMode
                ? 'bg-gray-600 ring-offset-gray-800'
                : 'bg-gray-100 ring-offset-white'
            }`}
            onClick={() => {
              // Use gray-900 (#111827) as the eraser in dark mode, white in light mode
              strokeColorRef.current = darkMode ? '#111827' : 'white';
              setCurrentColorIndex(-1); // Set to -1 to indicate none of the regular colors are selected
            }}
            aria-label="Eraser"
          >
            <Eraser size={14} color={darkMode ? "white" : "black"} />
          </button>
        </div>


        <div className="slider-container flex flex-col items-center gap-1 w-full px-2">
          <label htmlFor="linewidth" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}></label>
          <input
            type="range"
            id="linewidth"
            name="linewidth"
            min="2"
            max="10"
            value={store.penSize}
            onChange={(e) => {
              const newWidth = Math.max(2, Math.min(10, parseInt(e.target.value)));
              linewidthRef.current = newWidth;
              store.setPenSize(newWidth);
              setCtx((prevCtx) => {
                if (prevCtx) {
                  prevCtx.lineWidth = newWidth;
                }
                return prevCtx;
              });
            }}
            className={`w-full h-2 rounded-lg appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border
              [&::-moz-range-thumb]:cursor-pointer
              ${darkMode
                ? '[&::-webkit-slider-thumb]:bg-gray-300 [&::-webkit-slider-thumb]:border-gray-400 [&::-moz-range-thumb]:bg-gray-300 bg-gray-700'
                : '[&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-gray-300 [&::-moz-range-thumb]:bg-black bg-gray-200'
              }`}
            style={{
              background: darkMode
                ? `linear-gradient(to right, #ffffff 0%, #ffffff ${((store.penSize - 2) / 8) * 100}%, #4B5563 ${((store.penSize - 2) / 8) * 100}%, #4B5563 100%)`
                : `linear-gradient(to right, #000000 0%, #000000 ${((store.penSize - 2) / 8) * 100}%, #ccc ${((store.penSize - 2) / 8) * 100}%, #ccc 100%)`
            }}
          />
      </div>
        <button
          className={`cursor-pointer aspect-square p-2 rounded-full transition-colors gap-2 ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          }`}
          onClick={addTextbox}
        >
          <Type color={darkMode ? "white" : "black"} />
        </button>

        <button
          className={`cursor-pointer p-2 rounded-full text-red-500 transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
          }`}
          onClick={clearCanvas}
        >
          <X />
        </button>
        </div>

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

        {textboxes.map((box, index) => (
          <div
            key={box.id}
            className={`absolute pointer-events-auto group`}
            style={{
              left: box.x,
              top: box.y,
              width: box.width || '200px',
              height: box.height || '40px',
              position: 'absolute'
            }}
            onClick={(e) => handleTextboxClick(e, index)}
            onMouseDown={(e) => handleTextboxDragStart(e, index)}
          >
            <button
              className="w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity absolute -top-3 -right-3"
              onClick={() => deleteTextbox(index)}
            >
              ×
            </button>
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, #4B5563 50%)'
              }}
              onMouseDown={(e) => handleResizeStart(e, index)}
            />
            <textarea
              value={box.text}
              onChange={(e) => {
                setTextboxes(boxes =>
                  boxes.map((b, i) =>
                    i === index ? { ...b, text: e.target.value } : b
                  )
                );
              }}
              className="w-full h-full p-2 bg-white/90 border rounded-xl resize-none focus:outline-none"
              placeholder="Type here..."
              style={{ color: box.color }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        ))}

        {useHandTracking && !isHandReady && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white p-4 rounded-md z-50">
            <p className="text-center">Please allow camera access and wait for the hand tracking model to load...</p>
          </div>
        )}


      </div>

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

    </DarkModeContext.Provider>
  );
};

export default Canvas;