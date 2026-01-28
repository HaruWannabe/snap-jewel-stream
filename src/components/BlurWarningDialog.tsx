import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface BlurWarningDialogProps {
  open: boolean;
  score: number;
  onConfirm: () => void;
  onRetake: () => void;
}

export function BlurWarningDialog({ open, score, onConfirm, onRetake }: BlurWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Image May Be Blurry
          </DialogTitle>
          <DialogDescription>
            This photo appears to be out of focus or blurry. Sharpness score: {Math.round(score)}/100
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Would you like to save it anyway or retake the photo?
          </p>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" onClick={onRetake} className="flex-1">
            Retake
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="flex-1">
            Save Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
