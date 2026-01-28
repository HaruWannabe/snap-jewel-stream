import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isReady: boolean;
  error: string | null;
  isFocusLocked: boolean;
  isExposureLocked: boolean;
  focusPoint: { x: number; y: number } | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capturePhoto: () => Promise<Blob | null>;
  handleTapToFocus: (x: number, y: number) => void;
  toggleExposureLock: () => void;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusLocked, setIsFocusLocked] = useState(false);
  const [isExposureLocked, setIsExposureLocked] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      
      // iPhone 11 max resolution constraints
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { exact: 'environment' }, // Rear camera only
          width: { ideal: 4032 }, // iPhone 11 max
          height: { ideal: 3024 },
        },
        audio: false,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please ensure your device has a camera.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to start camera');
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
    setIsReady(false);
    setIsFocusLocked(false);
    setIsExposureLocked(false);
  }, []);

  const capturePhoto = useCallback(async (): Promise<Blob | null> => {
    if (!videoRef.current || !canvasRef.current || !isReady) {
      return null;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Set canvas to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame
    ctx.drawImage(video, 0, 0);
    
    // Convert to JPEG blob
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.92 // High quality JPEG
      );
    });
  }, [isReady]);

  const handleTapToFocus = useCallback((x: number, y: number) => {
    if (!trackRef.current || !videoRef.current) return;
    
    const track = trackRef.current;
    const video = videoRef.current;
    
    // Calculate normalized coordinates
    const rect = video.getBoundingClientRect();
    const normalizedX = (x - rect.left) / rect.width;
    const normalizedY = (y - rect.top) / rect.height;
    
    // Show focus indicator
    setFocusPoint({ x, y });
    setTimeout(() => {
      setFocusPoint(null);
      setIsFocusLocked(true);
    }, 500);
    
    // Try to apply focus constraints if supported
    const capabilities = track.getCapabilities?.();
    if (capabilities && 'focusMode' in capabilities) {
      const constraints: MediaTrackConstraints = {
        // @ts-ignore - focusMode and pointsOfInterest are valid but not in TS types
        focusMode: 'manual',
        pointsOfInterest: [{ x: normalizedX, y: normalizedY }],
      };
      
      track.applyConstraints(constraints).catch(() => {
        // Focus point not supported, but we still show the indicator
        console.log('Focus point not supported on this device');
      });
    }
  }, []);

  const toggleExposureLock = useCallback(() => {
    if (!trackRef.current) return;
    
    const newLocked = !isExposureLocked;
    setIsExposureLocked(newLocked);
    
    const track = trackRef.current;
    const capabilities = track.getCapabilities?.();
    
    if (capabilities && 'exposureMode' in capabilities) {
      const constraints: MediaTrackConstraints = {
        // @ts-ignore - exposureMode is valid but not in TS types
        exposureMode: newLocked ? 'manual' : 'continuous',
      };
      
      track.applyConstraints(constraints).catch(() => {
        console.log('Exposure lock not supported on this device');
      });
    }
  }, [isExposureLocked]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    isReady,
    error,
    isFocusLocked,
    isExposureLocked,
    focusPoint,
    startCamera,
    stopCamera,
    capturePhoto,
    handleTapToFocus,
    toggleExposureLock,
  };
}
