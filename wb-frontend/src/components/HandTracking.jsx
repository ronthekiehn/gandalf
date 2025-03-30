import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const HandTracking = ({ onHandUpdate }) => {
  const videoRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  // Initialize the HandLandmarker
  useEffect(() => {
    async function initializeHandLandmarker() {
      try {
        setIsLoading(true);

        // Create a vision tasks model
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

        // Initialize hand landmarker
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        setIsLoading(false);
        console.log('Hand landmarker initialized successfully');
      } catch (error) {
        console.error('Error initializing hand landmarker:', error);
        setIsLoading(false);
      }
    }

    initializeHandLandmarker();

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  // Setup webcam
  useEffect(() => {
    if (isLoading || !handLandmarkerRef.current) return;

    async function setupWebcam() {
      if (!videoRef.current) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          }
        });

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        requestRef.current = requestAnimationFrame(detectHands);
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    }

    setupWebcam();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [isLoading]);

  const detectHands = async () => {
    if (!videoRef.current || !handLandmarkerRef.current) return;

    // Only detect if we have a new video frame
    if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
      lastVideoTimeRef.current = videoRef.current.currentTime;

      try {
        const startTimeMs = performance.now();
        const results = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const handedness = results.handednesses[0][0];

          // Get index finger tip (landmark 8) and thumb tip (landmark 4)
          const indexTip = landmarks[8];
          const thumbTip = landmarks[4];
          const pinkyTip = landmarks[20];
          const ringTip = landmarks[16];
          const middleTip = landmarks[12];
          const wrist = landmarks[0];

          if (indexTip && thumbTip && wrist && pinkyTip && ringTip && middleTip) {
            // Calculate distance for pinch detection
            const pinch_distance = Math.sqrt(
              Math.pow(indexTip.x - thumbTip.x, 2) +
              Math.pow(indexTip.y - thumbTip.y, 2) +
              Math.pow(indexTip.z - thumbTip.z, 2)
            );

            const fist_distance = Math.sqrt(
              Math.pow(indexTip.x - wrist.x, 2) +
              Math.pow(indexTip.y - wrist.y, 2) +
              Math.pow(indexTip.z - wrist.z, 2) +
              Math.pow(pinkyTip.x - wrist.x, 2) +
              Math.pow(pinkyTip.y - wrist.y, 2) +
              Math.pow(pinkyTip.z - wrist.z, 2) +
              Math.pow(ringTip.x - wrist.x, 2) +
              Math.pow(ringTip.y - wrist.y, 2) +
              Math.pow(ringTip.z - wrist.z, 2) +
              Math.pow(middleTip.x - wrist.x, 2) +
              Math.pow(middleTip.y - wrist.y, 2) +
              Math.pow(middleTip.z - wrist.z, 2)
            );


            // Update parent component
            onHandUpdate({
              position: {
                x: indexTip.x * videoRef.current.videoWidth,
                y: indexTip.y * videoRef.current.videoHeight
              },
              isPinching: pinch_distance < 0.08, // Normalized distance threshold
              isFist: fist_distance < 0.5, // Normalized distance threshold
              landmarks: landmarks,
              handedness: handedness.categoryName
            });
          }
        }
      } catch (error) {
        console.error('Error in hand detection:', error);
      }
    }

    requestRef.current = requestAnimationFrame(detectHands);
  };

  return (
    <div className="absolute top-0 left-0 opacity-0 pointer-events-none">
      <video
        ref={videoRef}
        width="640"
        height="480"
        playsInline
        muted
      />
      {isLoading && (
        <div className="fixed top-4 left-4 bg-black/70 text-white p-3 rounded-md z-50">
          Loading hand tracking model...
        </div>
      )}
    </div>
  );
};

export default HandTracking;