import { useEffect, useRef, useState } from 'react';
import HandTracking from './HandTracking';

const Canvas = () => {
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

  useEffect(() => {
    if (!ctx) return;
    
    console.log('Rendering canvas:', { 
      strokesCount: strokes.length,
      currentStrokeLength: currentStroke.length,
      isDrawing
    });
    
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    strokes.forEach(stroke => {
      if (stroke.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      
      ctx.stroke();
    });
    
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
      ctx.fillStyle = isDrawing ? 'red' : 'blue';
      ctx.beginPath();
      ctx.arc(cursorPosition.x, cursorPosition.y, 10, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }, [ctx, strokes, currentStroke, cursorPosition, showCursor, isDrawing, useHandTracking]);

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
      setStrokes(prev => [...prev, currentStroke]);
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
  
  // Handle hand tracking updates
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
      if (currentStroke.length > 0) {
        setStrokes(prev => [...prev, currentStroke]);
        setCurrentStroke([]);
      }
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
