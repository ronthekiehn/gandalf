import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket';
import AdvancedFeatures from './AdvancedFeatures';
import { DarkModeContext } from '../contexts/DarkModeContext';

const Canvas = ({ roomCode }) => {
  const [userName, setUserName] = useState(() => {
    const savedName = localStorage.getItem('wb-username');
    return savedName || `User-${Math.floor(Math.random() * 1000)}`;
  });

  useEffect(() => {
    const savedName = localStorage.getItem('wb-username');
    if (savedName && /^User-\d+$/.test(savedName)) {
      localStorage.removeItem('wb-username');
      setUserName('');
    }
  }, []);

  const [provider] = useState(() => {
      const ydoc = new Y.Doc();
      const wsUrl = new URL('wss://ws.ronkiehn.dev'); // Change to your WebSocket server URL
      wsUrl.searchParams.set('username', userName);
      wsUrl.searchParams.set('room', roomCode);
      wsUrl.pathname = `/${roomCode}`;
      console.log(`Connecting to room: ${roomCode}`);

      const provider = new WebsocketProvider(wsUrl.toString(), roomCode, ydoc);

      provider.on('status', (event) => {
        console.log(`Room ${roomCode} - WebSocket status:`, event.status);
      });

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
  const [lineWidth, setLineWidth] = useState(3);
  const [ctx, setCtx] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [useHandTracking, setUseHandTracking] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [showCursor, setShowCursor] = useState(false);
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
  const cursorHistorySize = 2;
  const wasClickingRef = useRef(false);
  const [darkMode, setDarkMode] = useState(false);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const colors = ['black', 'red', 'blue', 'green'];
  const [currentColorIndex, setCurrentColorIndex] = useState(0);

  const cycleColor = () => {
    setCurrentColorIndex(prevIndex => {
      const newIndex = (prevIndex + 1) % colors.length;
      strokeColorRef.current = colors[newIndex];
      return newIndex;
    });
  };

  useEffect(() => {
    bgCanvasRef.current = bgCanvas;
  }, [bgCanvas]);

  useEffect(() => {
    const updateLocalAwareness = () => {
      if (useHandTracking && isHandReady) {
        awareness.setLocalState({
          cursor: cursorPosition,
          isDrawing,
          user: {
            id: ydoc.clientID,
            name: userName,
            color: strokeColorRef.current
          }
        });
      } else {
        awareness.setLocalState({
          cursor: { x: MouseEvent.x || cursorPosition.x, y: MouseEvent.y || cursorPosition.y },
          isDrawing,
          user: {
            id: ydoc.clientID,
            name: userName,
            color: strokeColorRef.current
          }
        });
      }
    };

    updateLocalAwareness();
    return () => {
      awareness.setLocalState(null);
    };
  }, [awareness, cursorPosition, isHandReady, useHandTracking, isDrawing, userName]);
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
        ctx.lineWidth = lineWidth;
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
    if (!ctx || !bgCanvasRef.current) return;

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
        let content;
        if (item.content && item.content.getContent) {
          content = item.content.getContent();
        } else if (Array.isArray(item.content)) {
          content = item.content;
        } else {
          console.warn("Unexpected content format:", item.content);
          return;
        }

        for (let i = 0; i < content.length; i++) {
          const strokeData = content[i];
          const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
          if (stroke && stroke.points) {
            renderStroke(stroke, bgCtx);
          }
        }
      });
    };

    const renderCanvas = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(bgCanvasRef.current, 0, 0);

      if (currentStroke.length > 0) {
        const tempStroke = {
          points: currentStroke,
          color: strokeColorRef.current,
          width: linewidthRef.current
        };
        renderStroke(tempStroke, ctx);
      }

      awareness.getStates().forEach((state, clientID) => {
        if (state.cursor && clientID !== ydoc.clientID) {
          ctx.save();

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

      if (showCursor && useHandTracking) {
        ctx.save();
        ctx.fillStyle = isDrawing ? strokeColorRef.current : 'gray';
        ctx.beginPath();
        ctx.arc(cursorPosition.x, cursorPosition.y, 10, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    };

    const animationFrame = requestAnimationFrame(function loop() {
      renderCanvas();
      requestAnimationFrame(loop);
    });

    yStrokes.observe(handleStrokeAdded);
    provider.on('sync', loadExistingStrokes);

    loadExistingStrokes();

    return () => {
      yStrokes.unobserve(handleStrokeAdded);
      provider.off('sync', loadExistingStrokes);
      cancelAnimationFrame(animationFrame);
    };
  }, [ctx, currentStroke, cursorPosition, showCursor, isDrawing, useHandTracking, awareness, yStrokes, provider, ydoc.clientID]);

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

  useEffect(() => {
    if (!provider?.ws) return;

    const handleMessage = (event) => {
      try {
        // Skip binary messages
        if (event.data instanceof ArrayBuffer) return;

        const data = JSON.parse(event.data);
        if (data.type === 'generatedImage') {
          setGeneratedImages(prev => [
            ...prev,
            {
              src: `data:${data.mimeType};base64,${data.data}`,
              alt: 'AI enhanced artwork',
              timestamp: Date.now()
            }
          ]);
          setIsGenerating(false);
        }
      } catch (error) {
        if (!(event.data instanceof ArrayBuffer)) {
          console.error('Error handling WebSocket message:', error);
        }
      }
    };

    provider.ws.addEventListener('message', handleMessage);
    return () => provider.ws.removeEventListener('message', handleMessage);
  }, [provider]);

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

  const addStrokeToBackground = (stroke) => {
    const smoothedStroke = smoothStroke(stroke);
    const newStroke = {
      id: crypto.randomUUID(),
      points: smoothedStroke,
      color: strokeColorRef.current,
      width: linewidthRef.current
    };

    yStrokes.push([newStroke]);

    return smoothedStroke;
  };

  const smoothStroke = (points, iterations = 12) => {
    return points;
  }

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
  }

  const endDrawing = () => {
    if (!isDrawing || useHandTracking) return;
    if (currentStrokeRef.current.length > 0) {
      const compressedStroke = compressStroke(currentStrokeRef.current);
      // First add stroke to background
      addStrokeToBackground(compressedStroke);
      // Then emit the stroke data as a custom event
      const strokeEndEvent = new CustomEvent('strokeEnd', {
        detail: {
          points: compressedStroke,
          color: strokeColorRef.current,
          width: linewidthRef.current
        }
      });
      canvasRef.current.dispatchEvent(strokeEndEvent);
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
    const rawX = canvas.width - handData.position.x * scaleX;
    const rawY = handData.position.y * scaleY;

    const smoothedPosition = smoothCursorPosition({ x: rawX, y: rawY });
    setCursorPosition(smoothedPosition);
    setShowCursor(true);

    const isPinching = handData.isPinching;
    const isFist = handData.isFist;
    const isClicking = handData.isClicking;  // From thumb-ring
    const isGen = handData.isGen;            // From thumb-pinky
    const wasPinching = prevPinchState.current;
    const wasClicking = wasClickingRef.current;

    // Handle fist gesture for clearing canvas
    if (isFist) {
      clearCanvas();
      return;
    }

    // Handle color cycling with thumb-ring
    if (!isClicking && wasClicking) {
      cycleColor();
    }
    wasClickingRef.current = isClicking;

    // Handle generation with thumb-pinky
    if (isGen && !isGenerating) {
      generateImage();
    }

    // Handle drawing with pinch gesture
    if (isPinching && !wasPinching) {
      setIsDrawing(true);
      setCurrentStroke([smoothedPosition]);
    } else if (isPinching && wasPinching) {
      const maxDistance = 100;
      let shouldAddPoint = true;
      const threshold = 5;

      if (currentStrokeRef.current.length > 0) {
        const prevPoint = currentStrokeRef.current[currentStrokeRef.current.length - 1];
        const distance = Math.sqrt(
          Math.pow(prevPoint.x - smoothedPosition.x, 2) +
          Math.pow(prevPoint.y - smoothedPosition.y, 2)
        );

        const speedFactor = Math.min(distance / maxDistance, 1);
        const adaptiveSmoothedPosition = {
          x: prevPoint.x + (smoothedPosition.x - prevPoint.x) * speedFactor,
          y: prevPoint.y + (smoothedPosition.y - prevPoint.y) * speedFactor
        };

        if (distance > maxDistance || distance < threshold) {
          shouldAddPoint = false;
        } else if (shouldAddPoint) {
          setCurrentStroke(prev => [...prev, adaptiveSmoothedPosition]);
        }
      }
    } else if (!isPinching && wasPinching) {
      if (currentStrokeRef.current.length > 0) {
        const compressedStroke = compressStroke(currentStrokeRef.current);
        addStrokeToBackground(compressedStroke);

        // Emit stroke end event for hand-drawn strokes
        const strokeEndEvent = new CustomEvent('strokeEnd', {
          detail: {
            points: compressedStroke,
            color: strokeColorRef.current,
            width: linewidthRef.current
          }
        });
        canvasRef.current.dispatchEvent(strokeEndEvent);
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


  const generateImage = async () => {
    if (!canvasRef.current) return;
    setIsGenerating(true);

    try {
      // Get all strokes
      const allStrokes = yStrokes.toArray().map(stroke => {
        const strokeData = Array.isArray(stroke) ? stroke[0] : stroke;
        console.log('Processing stroke:', {
          hasPoints: !!strokeData.points,
          pointCount: strokeData.points?.length,
          color: strokeData.color,
          width: strokeData.width
        });
        return {
          points: strokeData.points,
          color: strokeData.color,
          width: strokeData.width
        };
      });

      console.log('Sending generation request:', {
        strokeCount: allStrokes.length,
        timestamp: new Date().toISOString()
      });

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
      console.log('Generation result:', {
        success: true,
        imageCount: result.images?.length,
        hasText: !!result.text,
        timestamp: new Date().toISOString()
      });

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
      <div className={`min-h-screen w-full ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className={`absolute top-15 right-4 flex flex-col gap-2 ${darkMode ? 'text-white' : 'text-black'}`}>
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
          <div className="slider-container flex flex-col items-center gap-1 w-full px-2">
            <label htmlFor="linewidth" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Line Width</label>
            <input
              type="range"
              id="linewidth"
              name="linewidth"
              min="2"
              max="10"
              value={lineWidth}
              onChange={(e) => {
                const newWidth = Math.max(2, Math.min(10, parseInt(e.target.value)));
                linewidthRef.current = newWidth;
                setLineWidth(newWidth);
                setCtx((prevCtx) => {
                  if (prevCtx) {
                    prevCtx.lineWidth = newWidth;
                  }
                  return prevCtx;
                });
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-black [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #000000 0%, #000000 ${((lineWidth - 2) / 8) * 100}%, #ccc ${((lineWidth - 2) / 8) * 100}%, #ccc 100%)`
              }}
            />
            <span className="text-xs text-gray-500">{lineWidth}px</span>
          </div>
          <div className="flex gap-2">
            {colors.map((color, index) => (
              <button
                key={color}
                className={`w-10 h-10 rounded-full shadow-lg hover:opacity-80 ${
                  index === currentColorIndex ? 'ring-2 ring-offset-2 ring-white' : ''
                }`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  strokeColorRef.current = color;
                  setCurrentColorIndex(index);
                }}
                aria-label={color}
              />
            ))}
          </div>

          <button
            className="bg-purple-600 text-white p-2 rounded-full shadow-lg hover:bg-purple-700 flex items-center justify-center gap-2"
            onClick={addTextbox}
          >
            <span>📝</span> Add Text
          </button>

          <button
            className="bg-green-600 text-white p-2 rounded-full shadow-lg hover:bg-green-700 flex items-center justify-center gap-2"
            onClick={generateImage}
            disabled={isGenerating}
          >
            {isGenerating ? '⏳ Generating...' : '🎨 Generate Art'}
          </button>

          <div className="mb-4">
            <input
              type="text"
              value={userName}
              onChange={(e) => {
                const newName = e.target.value;
                setUserName(newName);
                localStorage.setItem('wb-username', newName);
              }}
              className="px-2 py-1 border rounded shadow-sm"
              placeholder="Enter your name"
            />
          </div>
        </div>
        <div className={`absolute top-15 left-4 ${darkMode ? 'bg-gray-800/90' : 'bg-white/90'} p-2 rounded shadow-lg`}>
          <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-black'}`}>Connected Users:</h3>
          <ul>
            {Array.from(awareness.getStates())
              .filter(([_, state]) => state.user?.name && state.user?.color)
              .map(([clientID, state]) => (
                <li key={clientID} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: state.user.color }}
                  />
                  {state.user.name}
                </li>
              ))}
          </ul>
        </div>
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}
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

        <AdvancedFeatures
          canvasRef={canvasRef}
          bgCanvasRef={bgCanvasRef}
          ydoc={ydoc}
          awareness={awareness}
        />
      </div>

      {generatedImages.length > 0 && (
        <div className="fixed bottom-4 left-4 bg-white/95 p-4 rounded-lg shadow-lg max-w-[80vw]">
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
                  className="h-48 w-48 object-contain rounded-lg border-2 border-gray-200"
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