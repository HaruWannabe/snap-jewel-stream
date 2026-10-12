import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Download, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  getTaggingLineConnection,
  getUploadJobs,
  getSublotPhotos,
  type PhotoMetadata,
  type PhotoUploadJob,
  type TaggingLineConnection,
} from '@/lib/storage';
import { exportPhotoBatch } from '@/lib/export';
import {
  completeTaggingLineSublot,
  getTaggingLineQueue,
  getTaggingLineSublot,
  skipSublotItem,
  type TaggingLineQueueEntry,
  type TaggingLineSublot,
} from '@/lib/tagging-line';
import { CameraView } from './CameraView';

interface ConnectedModeViewProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

function getNextPending(sublot: TaggingLineSublot): number | null {
  return sublot.items.filter((item) => item.status === 'pending').sort((a, b) => a.sequence - b.sequence)[0]?.sequence ?? null;
}

function overlayLocalPhotos(sublot: TaggingLineSublot, localPhotos: PhotoMetadata[]): TaggingLineSublot {
  const locallySaved = new Set(localPhotos.map((photo) => photo.connectedSequence));
  const items = sublot.items.map((item) =>
    item.status === 'pending' && locallySaved.has(item.sequence) ? { ...item, status: 'done' as const } : item
  );
  return { ...sublot, items, done_count: items.filter((item) => item.status === 'done').length };
}

export function ConnectedModeView({ onBack, onOpenSettings }: ConnectedModeViewProps) {
  const { toast } = useToast();
  const [connection, setConnection] = useState<TaggingLineConnection>({ baseUrl: '', deviceKey: '' });
  const [queue, setQueue] = useState<TaggingLineQueueEntry[]>([]);
  const [sublot, setSublot] = useState<TaggingLineSublot | null>(null);
  const [serverDoneCount, setServerDoneCount] = useState(0);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photos, setPhotos] = useState<PhotoMetadata[]>([]);
  const [jobs, setJobs] = useState<PhotoUploadJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [queueError, setQueueError] = useState<string | null>(null);
  const skipTimers = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; triggered: boolean }>());

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      skipTimers.current.forEach(({ timer }) => clearTimeout(timer));
      skipTimers.current.clear();
    };
  }, []);

  const refreshQueue = useCallback(async (showSpinner = false) => {
    if (!connection.baseUrl || !connection.deviceKey) {
      setQueue([]);
      setQueueError(null);
      setLoading(false);
      return;
    }
    if (showSpinner) setRefreshing(true);
    try {
      setQueue(await getTaggingLineQueue(connection));
      setQueueError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check the server connection.';
      setQueueError(message);
      toast({ title: 'Could not load work queue', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connection, toast]);

  useEffect(() => {
    void getTaggingLineConnection().then(setConnection);
  }, []);

  useEffect(() => {
    if (connection.baseUrl && connection.deviceKey) void refreshQueue();
    else setLoading(false);
  }, [connection, refreshQueue]);

  const openSublot = useCallback(async (sublotId: string) => {
    setLoading(true);
    try {
      const [remote, local, localJobs] = await Promise.all([
        getTaggingLineSublot(connection, sublotId),
        getSublotPhotos(sublotId),
        getUploadJobs(sublotId),
      ]);
      const merged = overlayLocalPhotos(remote, local);
      setSublot(merged);
      setServerDoneCount(remote.done_count);
      setPhotos(local);
      setJobs(localJobs);
      setSelectedSequence(getNextPending(merged));
      setCameraOpen(getNextPending(merged) !== null);
    } catch (error) {
      toast({ title: 'Could not open sublot', description: error instanceof Error ? error.message : 'Check the server connection.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [connection, toast]);

  useEffect(() => {
    if (!sublot) return;
    const onUploadChange = () => {
      void Promise.all([
        getTaggingLineSublot(connection, sublot.sublot_id),
        getSublotPhotos(sublot.sublot_id),
        getUploadJobs(sublot.sublot_id),
      ]).then(([remote, local, nextJobs]) => {
        setServerDoneCount(remote.done_count);
        setPhotos(local);
        setJobs(nextJobs);
        setSublot(overlayLocalPhotos(remote, local));
      }).catch(() => undefined);
    };
    window.addEventListener('taggingline:uploads', onUploadChange);
    return () => window.removeEventListener('taggingline:uploads', onUploadChange);
  }, [connection, sublot]);

  const uploadJobs = useMemo(() => jobs, [jobs]);
  const queued = uploadJobs.filter((job) => job.status === 'queued').length;
  const uploaded = uploadJobs.filter((job) => job.status === 'uploaded').length;
  const selectedItem = sublot?.items.find((item) => item.sequence === selectedSequence) ?? null;
  const pendingItem = sublot ? getNextPending(sublot) : null;
  const allRemainingSkipped = Boolean(sublot && sublot.items.some((item) => item.status === 'skipped') && sublot.items.every((item) => item.status !== 'pending'));

  const handleSkip = async (sequence: number) => {
    const item = sublot?.items.find((candidate) => candidate.sequence === sequence);
    if (!sublot || !item || item.status !== 'pending') return;
    const reason = window.prompt('Reason for skipping this compartment (short reason):');
    if (!reason?.trim()) return;
    try {
      await skipSublotItem(connection, sublot.sublot_id, sequence, reason.trim().slice(0, 160));
      const updated = await getTaggingLineSublot(connection, sublot.sublot_id);
      setServerDoneCount(updated.done_count);
      setSublot(updated);
      setSelectedSequence(getNextPending(updated));
    } catch (error) {
      toast({ title: 'Could not skip compartment', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    }
  };

  const handleFinish = async () => {
    if (!sublot) return;
    if (queued > 0) {
      toast({ title: 'Uploads still pending', description: `${queued} photo${queued === 1 ? '' : 's'} still need to upload. Finish after they are sent.` });
      return;
    }
    try {
      await completeTaggingLineSublot(connection, sublot.sublot_id);
      toast({ title: 'Sublot finished', description: `${sublot.lot_no} · sublot ${sublot.sublot_no} is complete.` });
      setSublot(null);
      await refreshQueue(true);
    } catch (error) {
      toast({ title: 'Could not finish sublot', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    }
  };

  const exportLocalSublot = async () => {
    const photosForExport = photos.map((photo) => ({ id: photo.id, filename: photo.filename }));
    if (!photosForExport.length) {
      toast({ title: 'No local photos', description: 'This sublot has no locally saved photos yet.' });
      return;
    }
    try {
      const safeName = `${sublot?.lot_no ?? 'sublot'}-${sublot?.sublot_no ?? ''}`.replace(/[^a-zA-Z0-9_-]/g, '-');
      const result = await exportPhotoBatch(photosForExport, { filename: `tagging-line-${safeName}.zip` });
      toast({ title: 'Sublot ZIP ready', description: `${result.count} saved photos were included.` });
    } catch (error) {
      toast({ title: 'ZIP export failed', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    }
  };

  if (selectedItem && sublot && cameraOpen) {
    return (
      <CameraView
        onOpenSettings={onOpenSettings}
        connected={{ connection, sublot, item: selectedItem, uploadCounts: { uploaded, queued } }}
        onConnectedSaved={async () => {
          const [nextPhotos, nextJobs] = await Promise.all([
            getSublotPhotos(sublot.sublot_id),
            getUploadJobs(sublot.sublot_id),
          ]);
          const updated = overlayLocalPhotos(sublot, nextPhotos);
          setPhotos(nextPhotos);
          setJobs(nextJobs);
          setSublot(updated);
          const next = getNextPending(updated);
          setSelectedSequence(next);
          if (next === null) setCameraOpen(false);
        }}
        onExitConnected={() => setCameraOpen(false)}
      />
    );
  }

  if (sublot) {
    const pendingJobs = jobs.filter((job) => job.status === 'queued').length;
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center justify-between border-b border-border bg-card px-3 py-3">
          <Button variant="ghost" size="icon" aria-label="Back to work queue" onClick={() => setSublot(null)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 flex-1 px-2">
            <p className="truncate font-semibold">{sublot.lot_no} · Sublot {sublot.sublot_no}</p>
            <p className="truncate text-xs text-muted-foreground">{sublot.product_name}</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Refresh sublot" onClick={() => void openSublot(sublot.sublot_id)}><RefreshCw className="h-4 w-4" /></Button>
        </header>

        <main className="space-y-4 p-3 pb-safe">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-sm">
            <span>{isOnline ? `Uploaded ${uploaded} · ${pendingJobs} pending` : `Offline — ${pendingJobs} queued`}</span>
            <Button size="sm" variant="outline" onClick={() => void exportLocalSublot()}><Download className="mr-1 h-4 w-4" />Export sublot ZIP</Button>
          </div>
          {sublot.trays.map((tray) => {
            const trayItems = sublot.items.filter((item) => item.tray_code === tray.tray_code);
            const compartmentMap = new Map(trayItems.map((item) => [item.compartment_no, item]));
            return (
              <section key={tray.tray_code} className="border-b border-border pb-4">
                <h2 className="mb-2 text-sm font-semibold">Tray {tray.tray_code}</h2>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, tray.columns)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: Math.max(0, tray.rows * tray.columns) }, (_, idx) => {
                    const compartment = idx + 1;
                    const item = compartmentMap.get(compartment);
                    if (!item) return <div key={compartment} className="aspect-square rounded border border-dashed border-border" aria-hidden="true" />;
                    const selected = selectedSequence === item.sequence;
                    const holdSkip = () => { void handleSkip(item.sequence); };
                    return (
                      <Button
                        key={item.sequence}
                        variant="outline"
                        className={`relative aspect-square h-auto min-w-0 flex-col gap-0.5 rounded-md border px-1 py-1 ${item.status === 'done' ? 'border-primary bg-primary/15' : item.status === 'skipped' ? 'border-muted-foreground bg-muted text-muted-foreground' : 'border-border bg-background'} ${selected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        onClick={() => {
                          const longPress = skipTimers.current.get(item.sequence);
                          if (longPress?.triggered) {
                            skipTimers.current.delete(item.sequence);
                            return;
                          }
                          if (item.status === 'skipped') return;
                          setSelectedSequence(item.sequence);
                        }}
                        onPointerDown={() => {
                          const press = { triggered: false, timer: setTimeout(() => {
                            press.triggered = true;
                            holdSkip();
                          }, 650) };
                          skipTimers.current.set(item.sequence, press);
                        }}
                        onPointerUp={() => {
                          const press = skipTimers.current.get(item.sequence);
                          if (press && !press.triggered) {
                            clearTimeout(press.timer);
                            skipTimers.current.delete(item.sequence);
                          }
                        }}
                        onPointerLeave={() => {
                          const press = skipTimers.current.get(item.sequence);
                          if (press && !press.triggered) {
                            clearTimeout(press.timer);
                            skipTimers.current.delete(item.sequence);
                          }
                        }}
                        aria-label={`Tray ${tray.tray_code}, compartment ${compartment}, ${item.status}, ${item.pcs} pcs. Hold to skip pending compartment.`}
                      >
                        <span className="text-xs font-semibold">{compartment}</span>
                        <span className="text-[10px]">{item.pcs} pcs</span>
                        <span className="text-[9px] capitalize">{item.status}</span>
                      </Button>
                    );
                  })}
                </div>
                <div className="mt-1 border-t border-border pt-1 text-center text-xs font-semibold text-muted-foreground">{tray.tray_code}</div>
              </section>
            );
          })}
          {selectedItem && <div className="sticky bottom-2 space-y-2 border-t border-border bg-background/95 p-3 backdrop-blur">
            <p className="text-center text-sm">Tray {selectedItem.tray_code} · Compartment {selectedItem.compartment_no}</p>
            <p className="truncate text-center font-mono text-xs text-muted-foreground">{selectedItem.filename}</p>
            <Button className="w-full" onClick={() => { setSelectedSequence(selectedItem.sequence); setCameraOpen(true); }}><Camera className="mr-2 h-4 w-4" />{selectedItem.status === 'done' ? 'Reshoot compartment' : 'Photograph compartment'}</Button>
          </div>}
          {pendingItem === null && <div className="space-y-2 border-t border-border pt-4">
            {pendingJobs > 0 && <p className="text-sm text-muted-foreground">{pendingJobs} photo upload{pendingJobs === 1 ? '' : 's'} remain queued.</p>}
            <Button className="w-full" onClick={() => void handleFinish()} disabled={pendingJobs > 0}>{allRemainingSkipped ? 'Finish anyway (remaining are skipped)' : 'Finish sublot'}</Button>
          </div>}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-3 py-3">
        <Button variant="ghost" size="icon" aria-label="Back to camera" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="flex-1 font-semibold">Tagging Line work queue</h1>
        <Button variant="outline" size="icon" aria-label="Refresh work queue" onClick={() => void refreshQueue(true)} disabled={refreshing}><RefreshCw className="h-4 w-4" /></Button>
      </header>
      <main className="space-y-3 p-3">
        {!connection.deviceKey || !connection.baseUrl ? <Card><CardContent className="space-y-3 p-4"><p className="text-sm text-muted-foreground">Set the server address and device key to load connected work. Manual photo capture remains available without them.</p><Button onClick={onOpenSettings}>Open connection settings</Button></CardContent></Card> : null}
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading work queue…</p> : null}
        {!loading && queueError && <Card><CardContent className="space-y-3 p-4"><p className="text-sm text-destructive">{queueError}</p><Button variant="outline" onClick={onBack}>Return to manual camera</Button></CardContent></Card>}
        {!loading && !queueError && connection.baseUrl && connection.deviceKey && queue.length === 0 ? <div className="py-10 text-center text-muted-foreground">No sublots in the queue.</div> : null}
        {queue.map((entry) => <Card key={entry.sublot_id} className="cursor-pointer" onClick={() => void openSublot(entry.sublot_id)}><CardContent className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">{entry.lot_no} · Sublot {entry.sublot_no}</p><p className="truncate text-sm text-muted-foreground">{entry.product_name}</p></div><div className="shrink-0 text-right"><p className="font-mono text-sm">{entry.done_count} / {entry.total_items}</p><p className="text-xs text-muted-foreground">done</p></div></CardContent></Card>)}
        {connection.baseUrl && connection.deviceKey && !isOnline && <p className="flex items-center gap-2 text-xs text-muted-foreground"><WifiOff className="h-4 w-4" />Offline — saved photos will upload when connected.</p>}
      </main>
    </div>
  );
}