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
  if (points.length < 2) return null;

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

  // Calculate scores for each shape
  const scores = {
    line: calculateLineScore(points),
    rectangle: calculateRectangleScore(points, minX, maxX, minY, maxY),
    circle: calculateCircleScore(points, centerX, centerY, width, height),
    triangle: calculateTriangleScore(points)
  };

  // Find the shape with highest score
  const bestShape = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b)[0];

  switch (bestShape) {
    case 'line': {
      const [start, end] = findLineEndpoints(points);
      return {
        type: 'line',
        points: [start, end]
      };
    }
    case 'rectangle': {
      const aspectRatio = width / height;
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
    case 'circle':
      const avgRadius = Math.min(width, height) / 2;
      return {
        type: 'circle',
        points: generateCirclePoints({ x: centerX, y: centerY }, avgRadius)
      };
    case 'triangle': {
      const vertices = findTriangleVertices(points);
      return {
        type: 'triangle',
        points: [...vertices, vertices[0]]
      };
    }
  }
};

const calculateRectangleScore = (points, minX, maxX, minY, maxY) => {
  const [start, end] = findLineEndpoints(points);
  const lineLength = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );
  
  // If points are very line-like, penalize rectangle score
  const width = maxX - minX;
  const height = maxY - minY;
  const aspectRatio = Math.max(width / height, height / width);
  if (aspectRatio > 4) return 0.1; // Heavy penalty for very elongated shapes

  const edgeDistances = points.map(point => {
    const distanceX = Math.min(Math.abs(point.x - minX), Math.abs(point.x - maxX));
    const distanceY = Math.min(Math.abs(point.y - minY), Math.abs(point.y - maxY));
    return Math.min(distanceX, distanceY);
  });
  return 1 / (1 + Math.average(edgeDistances));
};

const findStraightSections = (points) => {
  const sections = [];
  let currentSection = [points[0]];
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Check if current point is in line with prev and next
    const d = getDistanceToLine(curr, prev, next);
    if (d < 3) { // Threshold for "straightness"
      currentSection.push(curr);
    } else {
      if (currentSection.length > 3) { // Min points for a straight section
        sections.push([...currentSection]);
      }
      currentSection = [curr];
    }
  }
  
  if (currentSection.length > 3) {
    sections.push(currentSection);
  }
  
  return sections;
};

const calculateCircleScore = (points, centerX, centerY, width, height) => {
  const avgRadiusX = width / 2;
  const avgRadiusY = height / 2;

  // Find straight sections
  const straightSections = findStraightSections(points);
  const totalPoints = points.length;
  const pointsInStraightSections = straightSections.reduce((sum, section) => sum + section.length, 0);
  const straightRatio = pointsInStraightSections / totalPoints;
  
  // If more than 10% of points are in straight sections, heavily penalize circle score
  if (straightRatio > 0.10) {
    return 0.1;
  }

  const radiusDeviations = points.map(point => {
    const distanceFromCenterX = (point.x - centerX) / avgRadiusX;
    const distanceFromCenterY = (point.y - centerY) / avgRadiusY;
    const distanceFromEllipse = Math.sqrt(
      Math.pow(distanceFromCenterX, 2) + Math.pow(distanceFromCenterY, 2)
    );
    return Math.abs(distanceFromEllipse - 1);
  });

  // Lower score for very elongated ellipses
  const shapeRatio = Math.max(width / height, height / width);
  const ratioPenalty = shapeRatio > 2 ? 0.5 : 1;

  return (1 / (1 + Math.average(radiusDeviations))) * ratioPenalty;
};

const calculateTriangleScore = (points) => {
  const [start, end] = findLineEndpoints(points);
  const lineLength = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );
  
  // If points are very line-like, penalize triangle score
  const vertices = findTriangleVertices(points);
  let area;
  try {
    area = getTriangleArea(...vertices);
  } catch (error) {
    console.error('Error calculating triangle area:', error);
    return 0;
  }
  
  if (area < lineLength * 2) return 0.1; // Penalize thin triangles
  
  const distances = points.map(point => {
    return Math.min(...vertices.map((v1, i) => {
      const v2 = vertices[(i + 1) % 3];
      return getDistanceToLine(point, v1, v2);
    }));
  });
  return 1 / (1 + Math.average(distances));
};

const calculateLineScore = (points) => {
  if (points.length < 2) return 0;
  
  const [start, end] = findLineEndpoints(points);
  const distances = points.map(point => getDistanceToLine(point, start, end));
  
  // Calculate line length
  const lineLength = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );
  
  // Calculate straightness (how well points follow the line)
  const avgDistance = Math.average(distances);
  const straightness = 1 / (1 + avgDistance);
  
  // Bonus for longer lines with few deviations
  const lengthBonus = Math.min(lineLength / 100, 2);
  
  return straightness * lengthBonus * 2; // Multiply by 2 to give lines preference
};

const findLineEndpoints = (points) => {
  let maxDistance = 0;
  let endpoints = [points[0], points[1]];

  // Find the two points that are furthest apart
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const distance = Math.sqrt(
        Math.pow(points[i].x - points[j].x, 2) + 
        Math.pow(points[i].y - points[j].y, 2)
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        endpoints = [points[i], points[j]];
      }
    }
  }
  return endpoints;
};

// Add Math.average helper
Math.average = arr => arr.reduce((a, b) => a + b) / arr.length;

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
