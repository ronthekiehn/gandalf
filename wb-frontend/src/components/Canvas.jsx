import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';
import Toolbar from './Toolbar';
import useWhiteboardStore from '../stores/whiteboardStore';
import useUIStore from '../stores/uiStore';
import { cursorSmoothing } from '../utils/smoothing';

const Canvas = ({ roomCode }) => {
  const store = useWhiteboardStore();
  const clearProgress = useWhiteboardStore((state) => state.clearProgress);

  // Initialize Y.js connection with store's username
  useEffect(() => {
    store.initializeYjs(roomCode, store.userName);
    return () => store.cleanupYjs();
  }, [roomCode, store.userName]);

  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);

  const linewidthRef = useRef(3);
  const [ctx, setCtx] = useState(null);
  const { useHandTracking, darkMode } = useUIStore();
  const [isHandReady, setIsHandReady] = useState(false);
  const prevPinchState = useRef(false);
  const cursorHistoryRef = useRef([]);
  const cursorHistorySize = 1;
  const wasClickingRef = useRef(false);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = document.documentElement.clientWidth;
    canvas.height = document.documentElement.clientHeight - 48;
    store.setBgCanvas(canvas);
    bgCanvasRef.current = canvas;
  }, []);

  const redrawAllStrokes = (store, bgCanvas) => {
    const { yStrokes, ydoc } = store.getYjsResources();
    if (yStrokes && bgCanvas) {
      // Clear canvas first
      store.clearBgCanvas();

      // Redraw all strokes
      yStrokes.toArray().forEach((strokeData) => {
        const stroke = Array.isArray(strokeData) ? strokeData[0] : strokeData;
        if (stroke && stroke.points) {
          if (stroke.clientID === ydoc.clientID) {
            // If it's our stroke, ensure it's in localStrokes
            store.localStrokes.set(stroke.id, stroke);
          }
          store.drawStrokeOnBg(stroke);
        }
      });
    }
  };

  useEffect(() => {
    const setupCanvas = (canvas, context) => {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight - 48;
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
      context.strokeStyle = store.penColor;
    };

    const canvas = canvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    const context = canvas.getContext('2d');
    const bgContext = bgCanvas.getContext('2d');

    const resizeCanvas = () => {
      setupCanvas(canvas, context);
      setupCanvas(bgCanvas, bgContext);
      redrawAllStrokes(store, bgCanvas);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    setCtx(context);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useEffect(() => {
    redrawAllStrokes(store, bgCanvasRef.current);
  }, [darkMode]);

  useEffect(() => {
    if (!useHandTracking) return;
    cursorPositionRef.current = store.cursorPosition;
  }, [store.cursorPosition]);

  useEffect(() => {
    if (!ctx || !bgCanvasRef.current) return;

    const renderCanvas = () => {
      store.renderCanvas(ctx);
    };

    const animationFrame = requestAnimationFrame(function loop() {
      renderCanvas();
      requestAnimationFrame(loop);
    });

    store.setupCanvasSync();

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [ctx, useHandTracking]);

  // Add this new effect to sync showCursor with handTracking
  useEffect(() => {
    store.setShowCursor(useHandTracking);
  }, [useHandTracking]);

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
    const { smoothingParams } = useWhiteboardStore.getState();
    return cursorSmoothing(cursorHistoryRef.current, newPosition, smoothingParams);
  };

  const handleHandUpdate = (handData) => {
    if (!handData || !canvasRef.current) return;
    setIsHandReady(true);

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    const scaleX = (canvas.width / dpr) / 640;
    const scaleY = (canvas.height / dpr) / 480;

    const rawX = (canvas.width / dpr) - handData.position.x * scaleX;
    const rawY = handData.position.y * scaleY;

    const x = rawX - rect.left;
    const y = rawY - rect.top;

    const smoothedPosition = smoothCursorPosition({ x, y });

    store.updateCursorPosition(smoothedPosition);

    const isPinching = handData.isPinching;
    const isClicking = false;

    if (!isClicking && wasClickingRef.current) {
      store.cycleColor();
    }
    wasClickingRef.current = isClicking;

    if (isPinching && !prevPinchState.current) {
      store.startLine(smoothedPosition);
    } else if (isPinching && prevPinchState.current) {
      store.updateLine({ ...smoothedPosition, fromHandTracking: true });
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
            name: store.userName,
            color: store.penColor,
          },
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
  }, [store.isDrawing, useHandTracking]);

  useEffect(() => {
    const updateLocalAwareness = () => {
      if (useHandTracking && isHandReady) {
        store.updateAwareness({
          cursor: store.cursorPosition,
          isDrawing: store.isDrawing,
          user: {
            id: store.clientID,
            name: store.userName,
            color: store.penColor,
          },
        });
      }
    };

    updateLocalAwareness();
  }, [store.cursorPosition, isHandReady, useHandTracking, store.isDrawing]);

  const clearCanvas = () => {
    store.clearCanvas();
  };

  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className='h-full w-full flex justify-center'>
      <Toolbar />

      <canvas
        ref={canvasRef}
        className={`${!useHandTracking ? 'cursor-crosshair' : ''} w-full h-full bg-white dark:bg-neutral-900`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
      />

      {useHandTracking ? <HandTracking onHandUpdate={handleHandUpdate} /> : null}

      {useHandTracking && !isHandReady && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white p-4 rounded-md z-50">
          <p className="text-center">
            Please allow camera access and wait for the hand tracking model to load.
            <br />
            In this mode, pinch to draw and make a fist to clear the canvas.
          </p>
        </div>
      )}

      {clearProgress > 0 && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="!transition-none relative w-64 h-8 bg-neutral-200 dark:bg-neutral-700 dark:shadow-none rounded-full overflow-hidden shadow-lg">
            <div
              className="!transition-none absolute top-0 left-0 h-full bg-red-500"
              style={{ width: `${Math.floor(clearProgress * 100) + 10}%` }}
            ></div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className=" text-black dark:text-white">Clearing...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Canvas;