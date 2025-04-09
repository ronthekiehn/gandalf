export const drawingSmoothing = (lastPoint, newPoint, params) => {
  const distance = Math.sqrt(
    Math.pow(lastPoint.x - newPoint.x, 2) + Math.pow(lastPoint.y - newPoint.y, 2)
  );

  if (distance < params.drawingDeadzone) {
    return lastPoint;
  }

  const maxDistance = 100;
  const speedFactor = Math.min(distance / maxDistance, 1);

  return {
    x: lastPoint.x + (newPoint.x - lastPoint.x) * speedFactor,
    y: lastPoint.y + (newPoint.y - lastPoint.y) * speedFactor,
  };
};

export const cursorSmoothing = (history, newPoint, params) => {
    if (params.cursorHistorySize < 1) {
        return newPoint;
    }
  if (history.length === 0) {
    history.push(newPoint);
    return newPoint;
  }

  const lastPoint = history[history.length - 1];
  const newAvg = [...history, newPoint];
  const smoothedPoint = newAvg.reduce(
    (acc, pos) => ({
      x: acc.x + pos.x,
      y: acc.y + pos.y,
    }),
    { x: 0, y: 0 }
  );

  smoothedPoint.x /= newAvg.length;
  smoothedPoint.y /= newAvg.length;

  if (Math.abs(smoothedPoint.x - lastPoint.x) < params.cursorDeadzone) {
    smoothedPoint.x = lastPoint.x;
  }
  if (Math.abs(smoothedPoint.y - lastPoint.y) < params.cursorDeadzone) {
    smoothedPoint.y = lastPoint.y;
  }

  while (history.length >= params.cursorHistorySize) {
    history.shift();
  }

  history.push(smoothedPoint);

  return smoothedPoint;
};