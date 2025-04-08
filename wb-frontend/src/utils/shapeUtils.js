// entirely vibe coded by my boy alex
export const findTriangleVertices = (points) => {
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

export const detectShape = (points) => {
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
  
  // Scale tolerance based on shape size
  const sizeTolerance = Math.max(width, height) * 0.15;

  // Rectangle detection (more aggressive)
  const isRectangular = points.every(point => {
    // Check if point is near any of the four edges
    const distanceX = Math.min(Math.abs(point.x - minX), Math.abs(point.x - maxX));
    const distanceY = Math.min(Math.abs(point.y - minY), Math.abs(point.y - maxY));
    
    // Point should be near either vertical or horizontal edge
    return distanceX < sizeTolerance || distanceY < sizeTolerance;
  });

  // Additional rectangle validation using perimeter points
  const perimeterCheck = () => {
    const corners = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY }
    ];
    
    // Check if we have points near each corner
    return corners.every(corner => {
      return points.some(point => {
        const dist = Math.sqrt(
          Math.pow(point.x - corner.x, 2) + 
          Math.pow(point.y - corner.y, 2)
        );
        return dist < sizeTolerance;
      });
    });
  };

  if (isRectangular && perimeterCheck()) {
    const aspectRatio = width / height;
    // More relaxed square detection
    if (Math.abs(aspectRatio - 1) < 0.25) {
      return {
        type: 'square',
        points: generateRectPoints(minX, minY, Math.max(width, height), Math.max(width, height))
      };
    }
    return {
      type: 'rectangle',
      points: generateRectPoints(minX, minY, width, height)
    };
  }

  // Circle detection (slightly more tolerant)
  const avgRadius = Math.min(width, height) / 2;
  const isCircular = points.every((point) => {
    const distanceFromCenter = Math.sqrt(
      Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
    );
    return Math.abs(distanceFromCenter - avgRadius) < avgRadius * 0.35;
  });

  if (isCircular) {
    return {
      type: 'circle',
      points: generateCirclePoints({ x: centerX, y: centerY }, avgRadius)
    };
  }

  // Triangle detection (slightly more tolerant)
  if (points.length >= 3) {
    const vertices = findTriangleVertices(points);
    const isTriangle = points.every(point => {
      const distances = vertices.map((v1, i) => {
        const v2 = vertices[(i + 1) % 3];
        return getDistanceToLine(point, v1, v2);
      });
      return Math.min(...distances) < sizeTolerance;
    });

    if (isTriangle) {
      return {
        type: 'triangle',
        points: [...vertices, vertices[0]]
      };
    }
  }

  return null;
};

const generateCirclePoints = (center, radius) => {
  const points = [];
  for (let i = 0; i <= 360; i += 10) {
    const angle = (i * Math.PI) / 180;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  return points;
};

const generateRectPoints = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
  { x, y }
];
