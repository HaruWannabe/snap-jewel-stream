import { useState, useEffect } from 'react';
import { ArrowLeft, Eye, RotateCcw, Trash2, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAllPhotos, getPhotoBlob, deletePhoto, type PhotoMetadata } from '@/lib/storage';

interface PhotoListViewProps {
  onBack: () => void;
  onRetake: (prefix: string, tagNumber: string) => void;
}

export function PhotoListView({ onBack, onRetake }: PhotoListViewProps) {
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  
  // View dialog
  const [viewingPhoto, setViewingPhoto] = useState<PhotoMetadata | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);
  
  // Delete confirmation
  const [deletingPhoto, setDeletingPhoto] = useState<PhotoMetadata | null>(null);
  
  // Retake confirmation
  const [retakingPhoto, setRetakingPhoto] = useState<PhotoMetadata | null>(null);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    setLoading(true);
    const allPhotos = await getAllPhotos();
    // Sort by timestamp descending (newest first)
    allPhotos.sort((a, b) => b.timestamp - a.timestamp);
    setPhotos(allPhotos);
    
    // Load thumbnails
    const thumbs: Record<string, string> = {};
    for (const photo of allPhotos) {
      const blob = await getPhotoBlob(photo.id);
      if (blob) {
        thumbs[photo.id] = URL.createObjectURL(blob);
      }
    }
    setThumbnails(thumbs);
    setLoading(false);
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(thumbnails).forEach(url => URL.revokeObjectURL(url));
      if (viewingUrl) URL.revokeObjectURL(viewingUrl);
    };
  }, []);

  const handleView = async (photo: PhotoMetadata) => {
    const blob = await getPhotoBlob(photo.id);
    if (blob) {
      if (viewingUrl) URL.revokeObjectURL(viewingUrl);
      setViewingUrl(URL.createObjectURL(blob));
      setViewingPhoto(photo);
    }
  };

  const handleCloseView = () => {
    if (viewingUrl) URL.revokeObjectURL(viewingUrl);
    setViewingUrl(null);
    setViewingPhoto(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPhoto) return;
    
    await deletePhoto(deletingPhoto.id);
    
    // Revoke thumbnail URL
    if (thumbnails[deletingPhoto.id]) {
      URL.revokeObjectURL(thumbnails[deletingPhoto.id]);
    }
    
    // Remove from state
    setPhotos(prev => prev.filter(p => p.id !== deletingPhoto.id));
    setThumbnails(prev => {
      const { [deletingPhoto.id]: _, ...rest } = prev;
      return rest;
    });
    
    setDeletingPhoto(null);
  };

  const handleRetakeConfirm = async () => {
    if (!retakingPhoto) return;
    
    const { prefix, tagNumber, id } = retakingPhoto;
    
    // Delete the photo first
    await deletePhoto(id);
    
    // Revoke thumbnail URL
    if (thumbnails[id]) {
      URL.revokeObjectURL(thumbnails[id]);
    }
    
    setRetakingPhoto(null);
    
    // Go back to camera with prefix and tag pre-filled
    onRetake(prefix, tagNumber);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate category counts (read-only aggregation)
  const categoryCounts = photos.reduce<Record<string, number>>((acc, photo) => {
    acc[photo.prefix] = (acc[photo.prefix] || 0) + 1;
    return acc;
  }, {});

  // Sort categories alphabetically
  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => 
    a[0].localeCompare(b[0])
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">All Photos</h1>
          <p className="text-sm text-muted-foreground">{photos.length} photos</p>
        </div>
      </div>

      {/* Category Breakdown */}
      {!loading && photos.length > 0 && (
        <div className="px-4 py-3 bg-muted/50 border-b border-border">
          <div className="flex flex-wrap gap-2">
            {sortedCategories.map(([prefix, count]) => (
              <div
                key={prefix}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium"
              >
                <span className="font-mono">{prefix}</span>
                <span className="text-primary/70">-</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading photos...</p>
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Image className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No photos yet</p>
              <p className="text-sm text-muted-foreground/70">
                Start capturing to see them here
              </p>
            </div>
          ) : (
            photos.map((photo) => (
              <div
                key={photo.id}
                className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border"
              >
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                  {thumbnails[photo.id] ? (
                    <img
                      src={thumbnails[photo.id]}
                      alt={photo.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-medium truncate">{photo.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(photo.timestamp)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleView(photo)}
                    title="View"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRetakingPhoto(photo)}
                    title="Retake"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingPhoto(photo)}
                    title="Delete"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* View Dialog */}
      <Dialog open={!!viewingPhoto} onOpenChange={(open) => !open && handleCloseView()}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="font-mono">{viewingPhoto?.filename}</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            {viewingUrl && (
              <img
                src={viewingUrl}
                alt={viewingPhoto?.filename}
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingPhoto} onOpenChange={(open) => !open && setDeletingPhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-mono font-medium">{deletingPhoto?.filename}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retake Confirmation Dialog */}
      <AlertDialog open={!!retakingPhoto} onOpenChange={(open) => !open && setRetakingPhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retake Photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <span className="font-mono font-medium">{retakingPhoto?.filename}</span> and take you back to the camera with the same tag number pre-filled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetakeConfirm}>
              Retake
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
