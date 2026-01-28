import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Download, AlertTriangle, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getPrefixes,
  savePrefixes,
  getStorageUsage,
  deleteAllPhotos,
  getAllPhotos,
  PrefixItem,
} from '@/lib/storage';
import { exportAllPhotos } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';

interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const { toast } = useToast();
  
  const [prefixes, setPrefixes] = useState<PrefixItem[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [storageInfo, setStorageInfo] = useState({ count: 0, sizeBytes: 0 });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const loadedPrefixes = await getPrefixes();
    setPrefixes(loadedPrefixes);
    
    const usage = await getStorageUsage();
    setStorageInfo(usage);
  };

  const handleAddPrefix = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    
    const code = newCode.toUpperCase().trim();
    if (prefixes.some(p => p.code === code)) {
      toast({
        title: 'Prefix already exists',
        description: `${code} is already in your list.`,
        variant: 'destructive',
      });
      return;
    }
    
    const updated = [...prefixes, { code, name: newName.trim() }];
    await savePrefixes(updated);
    setPrefixes(updated);
    setNewCode('');
    setNewName('');
    
    toast({
      title: 'Prefix added',
      description: `${code} (${newName.trim()}) has been added.`,
    });
  };

  const handleRemovePrefix = async (code: string) => {
    if (prefixes.length <= 1) {
      toast({
        title: 'Cannot remove',
        description: 'You must have at least one prefix.',
        variant: 'destructive',
      });
      return;
    }
    
    const updated = prefixes.filter(p => p.code !== code);
    await savePrefixes(updated);
    setPrefixes(updated);
    
    toast({
      title: 'Prefix removed',
      description: `${code} has been removed.`,
    });
  };

  const handleExport = async () => {
    const photos = await getAllPhotos();
    if (photos.length === 0) {
      toast({
        title: 'No photos',
        description: 'There are no photos to export.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsExporting(true);
    try {
      const result = await exportAllPhotos();
      if (result.success) {
        toast({
          title: 'Export complete',
          description: `${result.count} photos exported successfully.`,
        });
      }
    } catch (err) {
      toast({
        title: 'Export failed',
        description: 'Failed to export photos. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      await deleteAllPhotos();
      setShowDeleteDialog(false);
      await loadData();
      
      toast({
        title: 'All photos deleted',
        description: 'Your photo library has been cleared.',
      });
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete photos. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>
      
      <div className="p-4 space-y-6 pb-safe">
        {/* Product Prefixes */}
        <Card>
          <CardHeader>
            <CardTitle>Product Prefixes</CardTitle>
            <CardDescription>Manage the product codes for filenames</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current prefixes */}
            <div className="space-y-2">
              {prefixes.map((prefix) => (
                <div
                  key={prefix.code}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div>
                    <span className="font-mono font-semibold">{prefix.code}</span>
                    <span className="text-muted-foreground ml-2">({prefix.name})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePrefix(prefix.code)}
                    disabled={prefixes.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            
            {/* Add new prefix */}
            <div className="flex gap-2">
              <Input
                placeholder="Code (e.g., AWER)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="font-mono flex-1"
                maxLength={6}
              />
              <Input
                placeholder="Name (e.g., Earring)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleAddPrefix}
                disabled={!newCode.trim() || !newName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Storage
            </CardTitle>
            <CardDescription>
              {storageInfo.count} photos • {formatBytes(storageInfo.sizeBytes)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleExport}
              disabled={isExporting || storageInfo.count === 0}
              className="w-full"
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : `Export All Photos (${storageInfo.count})`}
            </Button>
            
            <Button
              onClick={() => setShowDeleteDialog(true)}
              disabled={storageInfo.count === 0}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Photos
            </Button>
          </CardContent>
        </Card>
        
        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Jewellery Photo Capture v1.0
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Fast, reliable photography for your showroom
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete All Photos?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all {storageInfo.count} photos from your device.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="flex-1"
            >
              {isDeleting ? 'Deleting...' : 'Delete All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
