import { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crop, Check, X, RotateCcw } from 'lucide-react';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PhotoPreviewDialogProps {
  open: boolean;
  imageBlob: Blob | null;
  filename: string;
  onConfirm: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export function PhotoPreviewDialog({
  open,
  imageBlob,
  filename,
  onConfirm,
  onCancel,
}: PhotoPreviewDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // Create object URL for the blob
  useEffect(() => {
    if (imageBlob) {
      const url = URL.createObjectURL(imageBlob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [imageBlob]);

  // Initialize crop area when image loads
  const handleImageLoad = useCallback(() => {
    if (imageRef.current && containerRef.current) {
      const img = imageRef.current;
      const container = containerRef.current;
      
      // Get displayed image dimensions
      const displayedWidth = img.clientWidth;
      const displayedHeight = img.clientHeight;
      
      setImageSize({ width: displayedWidth, height: displayedHeight });
      
      // Set initial crop to full image
      setCropArea({
        x: 0,
        y: 0,
        width: displayedWidth,
        height: displayedHeight,
      });
    }
  }, []);

  const resetCrop = () => {
    if (imageRef.current) {
      setCropArea({
        x: 0,
        y: 0,
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, type: 'move' | 'resize', handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setIsDragging(true);
    setDragStart({ x: clientX, y: clientY });
    setDragType(type);
    if (handle) setResizeHandle(handle);
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging || !cropArea || !imageRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    
    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;
    
    if (dragType === 'move') {
      const newX = Math.max(0, Math.min(imgWidth - cropArea.width, cropArea.x + deltaX));
      const newY = Math.max(0, Math.min(imgHeight - cropArea.height, cropArea.y + deltaY));
      
      setCropArea(prev => prev ? { ...prev, x: newX, y: newY } : null);
    } else if (dragType === 'resize' && resizeHandle) {
      let newCrop = { ...cropArea };
      const minSize = 50;
      
      if (resizeHandle.includes('e')) {
        newCrop.width = Math.max(minSize, Math.min(imgWidth - cropArea.x, cropArea.width + deltaX));
      }
      if (resizeHandle.includes('w')) {
        const newWidth = Math.max(minSize, cropArea.width - deltaX);
        const newX = cropArea.x + (cropArea.width - newWidth);
        if (newX >= 0) {
          newCrop.x = newX;
          newCrop.width = newWidth;
        }
      }
      if (resizeHandle.includes('s')) {
        newCrop.height = Math.max(minSize, Math.min(imgHeight - cropArea.y, cropArea.height + deltaY));
      }
      if (resizeHandle.includes('n')) {
        const newHeight = Math.max(minSize, cropArea.height - deltaY);
        const newY = cropArea.y + (cropArea.height - newHeight);
        if (newY >= 0) {
          newCrop.y = newY;
          newCrop.height = newHeight;
        }
      }
      
      setCropArea(newCrop);
    }
    
    setDragStart({ x: clientX, y: clientY });
  }, [isDragging, cropArea, dragStart, dragType, resizeHandle]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const applyCrop = async () => {
    if (!imageBlob || !cropArea || !imageRef.current) {
      onConfirm(imageBlob!);
      return;
    }
    
    const img = imageRef.current;
    const displayedWidth = img.clientWidth;
    const displayedHeight = img.clientHeight;
    
    // Calculate scale from displayed to natural dimensions
    const scaleX = img.naturalWidth / displayedWidth;
    const scaleY = img.naturalHeight / displayedHeight;
    
    // Create canvas for cropping
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirm(imageBlob);
      return;
    }
    
    // Set canvas size to cropped dimensions (in natural pixels)
    canvas.width = cropArea.width * scaleX;
    canvas.height = cropArea.height * scaleY;
    
    // Draw cropped portion
    ctx.drawImage(
      img,
      cropArea.x * scaleX,
      cropArea.y * scaleY,
      cropArea.width * scaleX,
      cropArea.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );
    
    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onConfirm(blob);
        } else {
          onConfirm(imageBlob);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  const handleConfirm = () => {
    if (isCropping) {
      applyCrop();
    } else {
      onConfirm(imageBlob!);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-4 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-mono text-muted-foreground">{filename}</span>
          <div className="flex items-center gap-2">
            {isCropping && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetCrop}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
            <Button
              variant={isCropping ? "default" : "outline"}
              size="sm"
              onClick={() => setIsCropping(!isCropping)}
            >
              <Crop className="h-4 w-4 mr-1" />
              Crop
            </Button>
          </div>
        </div>
        
        <div 
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center bg-muted/50 rounded-lg overflow-hidden min-h-[300px]"
        >
          {imageUrl && (
            <>
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Preview"
                className="max-w-full max-h-[60vh] object-contain"
                onLoad={handleImageLoad}
              />
              
              {/* Crop overlay */}
              {isCropping && cropArea && (
                <>
                  {/* Darkened areas outside crop */}
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: imageRef.current ? imageRef.current.offsetTop : 0,
                      left: imageRef.current ? imageRef.current.offsetLeft : 0,
                      width: imageSize.width,
                      height: cropArea.y,
                    }}
                  />
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: imageRef.current ? imageRef.current.offsetTop + cropArea.y + cropArea.height : 0,
                      left: imageRef.current ? imageRef.current.offsetLeft : 0,
                      width: imageSize.width,
                      height: imageSize.height - cropArea.y - cropArea.height,
                    }}
                  />
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: imageRef.current ? imageRef.current.offsetTop + cropArea.y : 0,
                      left: imageRef.current ? imageRef.current.offsetLeft : 0,
                      width: cropArea.x,
                      height: cropArea.height,
                    }}
                  />
                  <div 
                    className="absolute bg-black/60 pointer-events-none"
                    style={{
                      top: imageRef.current ? imageRef.current.offsetTop + cropArea.y : 0,
                      left: imageRef.current ? imageRef.current.offsetLeft + cropArea.x + cropArea.width : 0,
                      width: imageSize.width - cropArea.x - cropArea.width,
                      height: cropArea.height,
                    }}
                  />
                  
                  {/* Crop selection box */}
                  <div
                    className="absolute border-2 border-primary cursor-move"
                    style={{
                      top: imageRef.current ? imageRef.current.offsetTop + cropArea.y : 0,
                      left: imageRef.current ? imageRef.current.offsetLeft + cropArea.x : 0,
                      width: cropArea.width,
                      height: cropArea.height,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                    onTouchStart={(e) => handleMouseDown(e, 'move')}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute left-1/3 top-0 bottom-0 w-px bg-primary/50" />
                      <div className="absolute left-2/3 top-0 bottom-0 w-px bg-primary/50" />
                      <div className="absolute top-1/3 left-0 right-0 h-px bg-primary/50" />
                      <div className="absolute top-2/3 left-0 right-0 h-px bg-primary/50" />
                    </div>
                    
                    {/* Resize handles - large touch targets for mobile */}
                    {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((handle) => {
                      // Visible handle positions (centered on corner/edge)
                      const visiblePositions: Record<string, React.CSSProperties> = {
                        nw: { top: -10, left: -10 },
                        n: { top: -10, left: '50%', transform: 'translateX(-50%)' },
                        ne: { top: -10, right: -10 },
                        w: { top: '50%', left: -10, transform: 'translateY(-50%)' },
                        e: { top: '50%', right: -10, transform: 'translateY(-50%)' },
                        sw: { bottom: -10, left: -10 },
                        s: { bottom: -10, left: '50%', transform: 'translateX(-50%)' },
                        se: { bottom: -10, right: -10 },
                      };
                      
                      // Touch target positions (larger invisible hit area)
                      const touchPositions: Record<string, React.CSSProperties> = {
                        nw: { top: -22, left: -22, cursor: 'nw-resize' },
                        n: { top: -22, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
                        ne: { top: -22, right: -22, cursor: 'ne-resize' },
                        w: { top: '50%', left: -22, transform: 'translateY(-50%)', cursor: 'w-resize' },
                        e: { top: '50%', right: -22, transform: 'translateY(-50%)', cursor: 'e-resize' },
                        sw: { bottom: -22, left: -22, cursor: 'sw-resize' },
                        s: { bottom: -22, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
                        se: { bottom: -22, right: -22, cursor: 'se-resize' },
                      };
                      
                      return (
                        <div
                          key={handle}
                          className="absolute"
                          style={touchPositions[handle]}
                        >
                          {/* Large invisible touch target (44x44 for iOS accessibility) */}
                          <div
                            className="w-11 h-11 flex items-center justify-center"
                            onMouseDown={(e) => handleMouseDown(e, 'resize', handle)}
                            onTouchStart={(e) => handleMouseDown(e, 'resize', handle)}
                          >
                            {/* Visible handle */}
                            <div 
                              className="w-5 h-5 bg-primary rounded-full border-2 border-background shadow-lg"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            <X className="h-4 w-4 mr-2" />
            Retake
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
          >
            <Check className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
