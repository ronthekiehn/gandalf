import { useEffect, useRef, useState } from 'react';
import '@mediapipe/hands';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';

const HandTracking = ({ onHandUpdate }) => {
  const videoRef = useRef(null);
  const [detector, setDetector] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestRef = useRef(null);

  // Initialize detector
  useEffect(() => {
    async function initializeDetector() {
      try {
        setIsLoading(true);
        
        // Create detector with specific configuration
        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
          runtime: 'mediapipe',
          modelType: 'lite',
          maxHands: 1,
          solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
        };
        
        const handDetector = await handPoseDetection.createDetector(model, detectorConfig);
        setDetector(handDetector);
        setIsLoading(false);
        console.log('Hand detector initialized successfully');
      } catch (error) {
        console.error('Error initializing hand detector:', error);
        setIsLoading(false);
      }
    }
    
    initializeDetector();
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
  
  // Setup webcam
  useEffect(() => {
    if (isLoading || !detector) return;
    
    async function setupWebcam() {
      if (!videoRef.current) return;
      
      try {
        // Get webcam access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: 640, 
            height: 480,
            facingMode: 'user'
          }
        });
        
        // Connect stream to video element
        const video = videoRef.current;
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            resolve(video);
          };
        });
        
        // Start playing the video
        await video.play();
        
        // Start detection loop
        startDetectionLoop();
      } catch (error) {
        console.error('Error setting up webcam:', error);
      }
    }
    
    setupWebcam();
  }, [detector, isLoading]);
  
  // Detection loop using requestAnimationFrame for smoother performance
  const startDetectionLoop = () => {
    const detectHands = async () => {
      if (!videoRef.current || !detector) return;
      
      try {
        // Detect hands
        const hands = await detector.estimateHands(videoRef.current);
        
        if (hands && hands.length > 0) {
          const hand = hands[0];
          const keypoints = hand.keypoints;
          
          // Process hand data
          if (keypoints && keypoints.length > 0) {
            // Find index finger tip and thumb tip
            const indexFinger = keypoints.find(kp => kp.name === 'index_finger_tip');
            const thumb = keypoints.find(kp => kp.name === 'thumb_tip');
            
            if (indexFinger && thumb) {
              // Calculate distance for pinch detection
              const distance = Math.sqrt(
                Math.pow(indexFinger.x - thumb.x, 2) + 
                Math.pow(indexFinger.y - thumb.y, 2)
              );
              
              // Send hand data to parent component
              onHandUpdate({
                position: {
                  x: indexFinger.x,
                  y: indexFinger.y
                },
                isPinching: distance < 40,
                landmarks: keypoints
              });
            }
          }
        }
      } catch (error) {
        console.error('Error in hand detection:', error);
      }
      
      // Continue the detection loop
      requestRef.current = requestAnimationFrame(detectHands);
    };
    
    detectHands();
  };
  
  // Cleanup function
  useEffect(() => {
    return () => {
      // Stop the camera when component unmounts
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
      
      // Cancel the animation frame
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
  
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
