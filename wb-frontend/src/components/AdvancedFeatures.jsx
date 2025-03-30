import { useState, useRef, useEffect, useContext } from 'react';
import { DarkModeContext } from '../contexts/DarkModeContext';

const AdvancedFeatures = ({ canvasRef, bgCanvasRef, ydoc, awareness }) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [miniMapVisible, setMiniMapVisible] = useState(false);
  const [shapeRecognitionEnabled, setShapeRecognitionEnabled] = useState(false);
  const miniMapRef = useRef(null);
  const { darkMode, setDarkMode } = useContext(DarkModeContext);

  const findTriangleVertices = (points) => {
    let vertices = [];
    let maxArea = 0;

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        for (let k = j + 1; k < points.length; k++) {
          const area = getTriangleArea(points[i], points[j], points[k]);
          if (area > maxArea) {
            maxArea = area;
            vertices = [points[i], points[j], points[k]];
          }
        }
      }
    }

    return vertices;
  };

  const getTriangleArea = (p1, p2, p3) => {
    return Math.abs((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y)) / 2;
  };

  const getDistanceToLine = (point, lineStart, lineEnd) => {
    const numerator = Math.abs(
      (lineEnd.y - lineStart.y) * point.x -
      (lineEnd.x - lineStart.x) * point.y +
      lineEnd.x * lineStart.y -
      lineEnd.y * lineStart.x
    );
    const denominator = Math.sqrt(
      Math.pow(lineEnd.y - lineStart.y, 2) +
      Math.pow(lineEnd.x - lineStart.x, 2)
    );
    return numerator / denominator;
  };

  const detectShape = (points) => {
    if (points.length < 3) return null;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Circle detection
    const isCircular = points.every((point) => {
      const distanceFromCenter = Math.sqrt(
        Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
      );
      const avgRadius = Math.min(width, height) / 2;
      return Math.abs(distanceFromCenter - avgRadius) < avgRadius * 0.3;
    });

    if (isCircular) {
      return {
        type: 'circle',
        center: { x: centerX, y: centerY },
        radius: Math.min(width, height) / 2
      };
    }

    // Rectangle detection
    const isRectangular = points.every(point => {
      const distanceX = Math.min(Math.abs(point.x - minX), Math.abs(point.x - maxX));
      const distanceY = Math.min(Math.abs(point.y - minY), Math.abs(point.y - maxY));
      return distanceX < 20 || distanceY < 20;
    });

    if (isRectangular) {
      const aspectRatio = width / height;
      if (Math.abs(aspectRatio - 1) < 0.2) {
        return { type: 'square', x: minX, y: minY, size: Math.max(width, height) };
      }
      return { type: 'rectangle', x: minX, y: minY, w: width, h: height };
    }

    // Triangle detection
    if (points.length >= 3) {
      const vertices = findTriangleVertices(points);
      const isTriangle = points.every(point => {
        const distances = vertices.map((v1, i) => {
          const v2 = vertices[(i + 1) % 3];
          return getDistanceToLine(point, v1, v2);
        });
        return Math.min(...distances) < 20;
      });

      if (isTriangle) {
        return { type: 'triangle', vertices };
      }
    }

    return null;
  };

  useEffect(() => {
    const handleStrokeEnd = (event) => {
      if (!shapeRecognitionEnabled) return;

      const stroke = event.detail;
      if (!stroke || !stroke.points || stroke.points.length < 3) return;

      const shape = detectShape(stroke.points);
      if (!shape) return;

      const ctx = bgCanvasRef.current.getContext('2d');

      // Create points for perfect shapes
      let perfectPoints = [];
      switch (shape.type) {
        case 'circle':
          // Generate circle points
          for (let i = 0; i <= 360; i += 10) {
            const angle = (i * Math.PI) / 180;
            perfectPoints.push({
              x: shape.center.x + shape.radius * Math.cos(angle),
              y: shape.center.y + shape.radius * Math.sin(angle)
            });
          }
          break;
        case 'square':
          const size = shape.size || shape.width;
          perfectPoints = [
            { x: shape.x, y: shape.y },
            { x: shape.x + size, y: shape.y },
            { x: shape.x + size, y: shape.y + (shape.height || size) },
            { x: shape.x, y: shape.y + (shape.height || size) },
            { x: shape.x, y: shape.y }
          ];
          break;
        case 'triangle':
          perfectPoints = [
            shape.vertices[0],
            shape.vertices[1],
            shape.vertices[2],
            shape.vertices[0]
          ];
          break;
        case 'rectangle':
            perfectPoints = [
                { x: shape.x, y: shape.y },                    // Top-left
                { x: shape.x + shape.w, y: shape.y },      // Top-right
                { x: shape.x + shape.w, y: shape.y + shape.h }, // Bottom-right
                { x: shape.x, y: shape.y + shape.h },     // Bottom-left
                { x: shape.x, y: shape.y }                     // Back to start
            ];
            break;
      }

        // Clear original stroke using stroke path
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = stroke.width + 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        // Follow the original stroke path
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
        ctx.restore();

        // Then draw the perfect shape (existing code remains the same)
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw using points
      ctx.moveTo(perfectPoints[0].x, perfectPoints[0].y);
      for (let i = 1; i < perfectPoints.length; i++) {
        ctx.lineTo(perfectPoints[i].x, perfectPoints[i].y);
      }

      ctx.stroke();
      ctx.restore();

      // Update Yjs with perfect stroke
      ydoc.transact(() => {
        const strokesArray = ydoc.getArray('strokes');
        if (strokesArray.length > 0) {
          strokesArray.delete(strokesArray.length - 1, 1);
        }
        strokesArray.push([{
          id: crypto.randomUUID(),
          points: perfectPoints,
          color: stroke.color,
          width: stroke.width,
          type: shape.type,
          ...shape
        }]);
      });
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('strokeEnd', handleStrokeEnd);
      return () => canvas.removeEventListener('strokeEnd', handleStrokeEnd);
    }
  }, [canvasRef, shapeRecognitionEnabled, ydoc]);

  // Mini-map rendering
  useEffect(() => {
    if (!miniMapVisible || !miniMapRef.current || !bgCanvasRef.current) return;
    const miniMapCtx = miniMapRef.current.getContext('2d');
    const bgCtx = bgCanvasRef.current.getContext('2d');
    miniMapCtx.clearRect(0, 0, miniMapRef.current.width, miniMapRef.current.height);
    miniMapCtx.drawImage(bgCanvasRef.current, 0, 0, miniMapRef.current.width, miniMapRef.current.height);
  }, [miniMapVisible, bgCanvasRef]);

  // Handle chat messages
  const sendMessage = () => {
    if (!newMessage.trim()) return;
    setChatMessages([...chatMessages, { user: 'You', text: newMessage }]);
    setNewMessage('');
  };

  // Export canvas as PNG
  const exportAsPNG = () => {
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Import image as reference
  const importImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ctx = bgCanvasRef.current.getContext('2d');
        ctx.drawImage(img, 0, 0, bgCanvasRef.current.width, bgCanvasRef.current.height);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`advanced-features p-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} rounded shadow-md`}>
      <h2 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-black'}`}>
        Advanced Features
      </h2>

      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-2 rounded shadow ${
            shapeRecognitionEnabled
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
          onClick={() => setShapeRecognitionEnabled(prev => !prev)}
        >
          Shape Recognition: {shapeRecognitionEnabled ? 'ON' : 'OFF'}
        </button>

        <button
          className={`px-4 py-2 rounded shadow ${
            darkMode
              ? 'bg-yellow-500 text-black hover:bg-yellow-600'
              : 'bg-gray-700 text-white hover:bg-gray-800'
          }`}
          onClick={() => setDarkMode(prev => !prev)}
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      <button
        className="bg-green-500 text-white px-4 py-2 rounded shadow hover:bg-green-600 mb-2"
        onClick={() => setMiniMapVisible(!miniMapVisible)}
      >
        {miniMapVisible ? 'Hide Mini-map' : 'Show Mini-map'}
      </button>

      {miniMapVisible && (
        <canvas
          ref={miniMapRef}
          className="mini-map"
          width={200}
          height={200}
          style={{ border: '1px solid black', position: 'absolute', bottom: 10, right: 10 }}
        />
      )}

      <div className={`chat-system ${darkMode ? 'bg-gray-700' : 'bg-white'} p-4 rounded shadow mb-4`}>
        <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-black'}`}>Chat</h3>
        <div className="chat-messages h-32 overflow-y-auto border p-2 rounded mb-2">
          {chatMessages.map((msg, index) => (
            <div key={index} className={darkMode ? 'text-white' : 'text-black'}>
              <strong>{msg.user}:</strong> {msg.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow border rounded px-2 py-1"
          />
          <button
            className="bg-blue-500 text-white px-4 py-1 rounded shadow hover:bg-blue-600"
            onClick={sendMessage}
          >
            Send
          </button>
        </div>
      </div>

      <div className="export-import">
        <h3 className={`font-bold mb-2 ${darkMode ? 'text-white' : 'text-black'}`}>Export/Import</h3>
        <div className="flex gap-2">
          <button
            className="bg-purple-500 text-white px-4 py-2 rounded shadow hover:bg-purple-600"
            onClick={exportAsPNG}
          >
            Export as PNG
          </button>
          <label className="bg-gray-300 text-black px-4 py-2 rounded shadow hover:bg-gray-400 cursor-pointer">
            Import Image
            <input
              type="file"
              accept="image/*"
              onChange={importImage}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export default AdvancedFeatures;
