import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Settings, Lock, Unlock, AlertCircle, Eye, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCamera } from '@/hooks/useCamera';
import { getPrefixes, savePhoto, checkFilenameExists, getTodayCount, PrefixItem } from '@/lib/storage';
import { detectBlur } from '@/lib/blur-detection';
import { BlurWarningDialog } from './BlurWarningDialog';
import { DuplicateWarningDialog } from './DuplicateWarningDialog';
import { PhotoPreviewDialog } from './PhotoPreviewDialog';
import { PhotoListView } from './PhotoListView';
import { cn } from '@/lib/utils';

interface CameraViewProps {
  onOpenSettings: () => void;
}

export function CameraView({ onOpenSettings }: CameraViewProps) {
  const {
    videoRef,
    canvasRef,
    isReady,
    error,
    isFocusLocked,
    isExposureLocked,
    focusPoint,
    startCamera,
    capturePhoto,
    handleTapToFocus,
    toggleExposureLock,
  } = useCamera();
  
  const tagInputRef = useRef<HTMLInputElement>(null);
  
  const [prefixes, setPrefixes] = useState<PrefixItem[]>([]);
  const [selectedPrefix, setSelectedPrefix] = useState<string>('');
  const [tagNumber, setTagNumber] = useState('');
  const [todayCount, setTodayCount] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Photo list view
  const [showPhotoList, setShowPhotoList] = useState(false);
  
  // Preview mode
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  
  // Dialogs
  const [blurDialogOpen, setBlurDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [blurScore, setBlurScore] = useState(0);

  // Initialize
  useEffect(() => {
    const init = async () => {
      const loadedPrefixes = await getPrefixes();
      setPrefixes(loadedPrefixes);
      if (loadedPrefixes.length > 0) {
        setSelectedPrefix(loadedPrefixes[0].code);
      }
      
      const count = await getTodayCount();
      setTodayCount(count);
      
      await startCamera();
    };
    
    init();
  }, [startCamera]);

  // Auto-focus tag input when ready
  useEffect(() => {
    if (isReady && tagInputRef.current) {
      tagInputRef.current.focus();
    }
  }, [isReady]);

  const filename = selectedPrefix && tagNumber ? `${selectedPrefix}${tagNumber}.jpg` : '';
  const canCapture = isReady && selectedPrefix && tagNumber.trim() && !isCapturing;

  const handleVideoTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    handleTapToFocus(e.clientX, e.clientY);
  };

  const handleCapture = async () => {
    if (!canCapture) return;
    
    setIsCapturing(true);
    
    try {
      const blob = await capturePhoto();
      if (!blob) {
        setIsCapturing(false);
        return;
      }
      
      // Check for duplicate first
      const exists = await checkFilenameExists(selectedPrefix, tagNumber);
      if (exists) {
        setPendingBlob(blob);
        setDuplicateDialogOpen(true);
        setIsCapturing(false);
        return;
      }
      
      // If preview mode is enabled, show preview dialog
      if (previewEnabled) {
        setPendingBlob(blob);
        setPreviewDialogOpen(true);
        setIsCapturing(false);
        return;
      }
      
      // Check for blur
      const { isBlurry, score } = await detectBlur(blob);
      if (isBlurry) {
        setPendingBlob(blob);
        setBlurScore(score);
        setBlurDialogOpen(true);
        setIsCapturing(false);
        return;
      }
      
      // Save directly
      await savePhotoAndReset(blob, false);
    } catch (err) {
      console.error('Capture error:', err);
      setIsCapturing(false);
    }
  };
  
  // Handle preview confirm (with optional crop)
  const handlePreviewConfirm = async (croppedBlob: Blob) => {
    setPreviewDialogOpen(false);
    
    // Still check for blur on the final image
    const { isBlurry, score } = await detectBlur(croppedBlob);
    if (isBlurry) {
      setPendingBlob(croppedBlob);
      setBlurScore(score);
      setBlurDialogOpen(true);
      return;
    }
    
    await savePhotoAndReset(croppedBlob, false);
  };
  
  const handlePreviewCancel = () => {
    setPreviewDialogOpen(false);
    setPendingBlob(null);
    tagInputRef.current?.focus();
  };

  const savePhotoAndReset = async (blob: Blob, overwrite: boolean) => {
    const result = await savePhoto(blob, selectedPrefix, tagNumber, overwrite);
    
    if (result.success) {
      // Success feedback
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 500);
      
      // Update count
      const count = await getTodayCount();
      setTodayCount(count);
      
      // Reset for next capture
      setTagNumber('');
      setPendingBlob(null);
      setIsCapturing(false);
      
      // Refocus input
      setTimeout(() => {
        tagInputRef.current?.focus();
      }, 100);
    } else {
      setIsCapturing(false);
    }
  };

  const handleBlurConfirm = async () => {
    if (pendingBlob) {
      setBlurDialogOpen(false);
      await savePhotoAndReset(pendingBlob, false);
    }
  };

  const handleBlurRetake = () => {
    setBlurDialogOpen(false);
    setPendingBlob(null);
    tagInputRef.current?.focus();
  };

  const handleDuplicateConfirm = async () => {
    if (pendingBlob) {
      setDuplicateDialogOpen(false);
      await savePhotoAndReset(pendingBlob, true);
    }
  };

  const handleDuplicateCancel = () => {
    setDuplicateDialogOpen(false);
    setPendingBlob(null);
    tagInputRef.current?.focus();
  };

  // Handle retake from photo list
  const handleRetakeFromList = (prefix: string, retakeTagNumber: string) => {
    setShowPhotoList(false);
    setSelectedPrefix(prefix);
    setTagNumber(retakeTagNumber);
    setTimeout(() => tagInputRef.current?.focus(), 100);
  };

  // Show photo list view
  if (showPhotoList) {
    return (
      <PhotoListView
        onBack={() => setShowPhotoList(false)}
        onRetake={handleRetakeFromList}
      />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Camera Error</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={startCamera}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="font-medium">Today: {todayCount} photos</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPhotoList(true)}
            className="flex items-center gap-1"
          >
            <List className="h-4 w-4" />
            <span>All Photos</span>
          </Button>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="preview-mode" className="text-sm">Preview</Label>
            <Switch
              id="preview-mode"
              checked={previewEnabled}
              onCheckedChange={setPreviewEnabled}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {/* Camera preview */}
      <div className="relative flex-1 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
          onClick={handleVideoTap}
        />
        
        {/* Focus indicator */}
        {focusPoint && (
          <div
            className="absolute w-16 h-16 border-2 border-primary rounded-lg animate-pulse pointer-events-none"
            style={{
              left: focusPoint.x - 32,
              top: focusPoint.y - 32,
            }}
          />
        )}
        
        {/* Lock indicators */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {isFocusLocked && (
            <div className="flex items-center gap-1 bg-background/80 rounded-full px-2 py-1 text-xs">
              <Lock className="h-3 w-3" />
              <span>Focus</span>
            </div>
          )}
          <button
            onClick={toggleExposureLock}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors",
              isExposureLocked
                ? "bg-primary text-primary-foreground"
                : "bg-background/80 text-foreground"
            )}
          >
            {isExposureLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            <span>AE</span>
          </button>
        </div>
        
        {/* Success flash */}
        {showSuccess && (
          <div className="absolute inset-0 bg-primary/20 pointer-events-none animate-pulse" />
        )}
      </div>
      
      {/* Controls */}
      <div className="bg-card border-t border-border p-4 space-y-4 pb-safe">
        {/* Prefix toggles */}
        <ToggleGroup
          type="single"
          value={selectedPrefix}
          onValueChange={(value) => value && setSelectedPrefix(value)}
          className="grid grid-cols-3 gap-2"
        >
          {prefixes.map((prefix) => (
            <ToggleGroupItem
              key={prefix.code}
              value={prefix.code}
              className={cn(
                "h-14 text-base font-semibold border-2 rounded-lg",
                selectedPrefix === prefix.code
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              )}
            >
              <div className="flex flex-col items-center">
                <span>{prefix.code}</span>
                <span className="text-xs font-normal opacity-70">{prefix.name}</span>
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        
        {/* Tag input and filename preview */}
        <div className="space-y-2">
          <Input
            ref={tagInputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter tag number"
            value={tagNumber}
            onChange={(e) => setTagNumber(e.target.value.replace(/[^0-9]/g, ''))}
            className="h-14 text-xl text-center font-mono"
          />
          
          {filename && (
            <p className="text-center text-sm text-muted-foreground font-mono">
              {filename}
            </p>
          )}
        </div>
        
        {/* Capture button */}
        <Button
          onClick={handleCapture}
          disabled={!canCapture}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          {isCapturing ? 'Saving...' : 'Capture Photo'}
        </Button>
      </div>
      
      {/* Dialogs */}
      <BlurWarningDialog
        open={blurDialogOpen}
        score={blurScore}
        onConfirm={handleBlurConfirm}
        onRetake={handleBlurRetake}
      />
      
      <DuplicateWarningDialog
        open={duplicateDialogOpen}
        filename={filename}
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
      />
      
      <PhotoPreviewDialog
        open={previewDialogOpen}
        imageBlob={pendingBlob}
        filename={filename}
        onConfirm={handlePreviewConfirm}
        onCancel={handlePreviewCancel}
      />
    </div>
  );
}
