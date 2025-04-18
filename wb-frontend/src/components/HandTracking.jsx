import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import useWhiteboardStore from '../stores/whiteboardStore';

const HandTracking = ({ onHandUpdate }) => {
  const videoRef = useRef(null);
  const handLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const fistStartTimeRef = useRef(null);
  const FIST_CLEAR_DELAY = 1500; // 1 second
  const pinchDist = useWhiteboardStore((state) => state.pinchDist);
  const store = useWhiteboardStore();

  useEffect(() => {
    async function initializeHandLandmarker() {
      try {
        setIsLoading(true);

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );

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

  useEffect(() => {
    if (isLoading || !handLandmarkerRef.current) return;

    async function setupWebcam() {
      try {
        if (!videoRef.current) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          }
        });

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        requestRef.current = requestAnimationFrame(detectHands);
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    }

    setupWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isLoading]);

  const detectHands = async () => {
    if (!videoRef.current || !handLandmarkerRef.current) return;

    if (lastVideoTimeRef.current !== videoRef.current.currentTime) {
      lastVideoTimeRef.current = videoRef.current.currentTime;

      const startTimeMs = performance.now();
      try {
        const results = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const handedness = results.handednesses[0][0];
          const indexTip = landmarks[8];
          const thumbTip = landmarks[4];
          const pinkyTip = landmarks[20];
          const ringTip = landmarks[16];
          const middleTip = landmarks[12];
          const wrist = landmarks[0];

          if (indexTip && thumbTip && wrist && pinkyTip && ringTip && middleTip) {
            const pinch_distance = Math.sqrt(
              Math.pow(indexTip.x - thumbTip.x, 2) +
              Math.pow(indexTip.y - thumbTip.y, 2) +
              Math.pow(indexTip.z - thumbTip.z, 2)
            );

            const fist_distance = Math.sqrt(
              Math.pow(indexTip.x - wrist.x, 2) +
              Math.pow(indexTip.y - wrist.y, 2) +
              Math.pow(indexTip.z - wrist.z, 2)
            );

            const isFist = fist_distance < 0.2;

            if (isFist && !fistStartTimeRef.current) {
              fistStartTimeRef.current = Date.now();
            } else if (!isFist && fistStartTimeRef.current) {
              store.setClearProgress(0);
              fistStartTimeRef.current = null;
            }

            if (fistStartTimeRef.current) {
              const progress = Math.min((Date.now() - fistStartTimeRef.current) / FIST_CLEAR_DELAY, 1);
              store.setClearProgress(progress);
              if (progress >= 1) {
                store.clearCanvas();
                fistStartTimeRef.current = null;
                store.setClearProgress(0);
              }
            }

            onHandUpdate({
              position: {
                x: indexTip.x * videoRef.current.videoWidth,
                y: indexTip.y * videoRef.current.videoHeight
              },
              isPinching: pinch_distance < pinchDist,
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