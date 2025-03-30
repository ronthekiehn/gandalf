import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket';

const Canvas = () => {
  const [userName, setUserName] = useState(() => {
    const savedName = localStorage.getItem('wb-username');
    return savedName || `User-${Math.floor(Math.random() * 1000)}`;
  });

  useEffect(() => {
    // Clear anonymous usernames from localStorage
    const savedName = localStorage.getItem('wb-username');
    if (savedName && /^User-\d+$/.test(savedName)) {
      localStorage.removeItem('wb-username');
      setUserName('');
    }
  }, []);

  const [provider] = useState(() => {
    const ydoc = new Y.Doc();
    const wsUrl = new URL('ws://localhost:1234');
    wsUrl.searchParams.set('username', userName);
    const provider = new WebsocketProvider(wsUrl.toString(), 'my-roomname', ydoc);
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
    const rawX = canvas.width - handData.position.x * scaleX;
    const rawY = handData.position.y * scaleY;

    const smoothedPosition = smoothCursorPosition({ x: rawX, y: rawY });
    setCursorPosition(smoothedPosition);
    setShowCursor(true);

    const isPinching = handData.isPinching;
    const wasPinching = prevPinchState.current;

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
    <div className="absolute top-15 right-4 flex flex-col gap-2">
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
          style={{
            background: `linear-gradient(to right, #000000 0%, #000000 ${lineWidth / 10 * 100}%, #ccc ${lineWidth / 10 * 100}%, #ccc 100%)`
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

      <button
        className="bg-purple-600 text-white p-2 rounded-full shadow-lg hover:bg-purple-700 flex items-center justify-center gap-2"
        onClick={addTextbox}
      >
        <span>📝</span> Add Text
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
    <div className="absolute top-15 left-4 bg-white/90 p-2 rounded shadow-lg">
      <h3 className="font-bold mb-2">Connected Users:</h3>
      <ul>
        {Array.from(awareness.getStates()).map(([clientID, state]) => (
          <li key={clientID} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: state.user?.color}}
            />
            {state.user?.name}
          </li>
        ))}
      </ul>
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
    </>
  );
};

export default Canvas;