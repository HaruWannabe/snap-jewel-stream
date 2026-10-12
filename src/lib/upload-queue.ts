import {
  getDueUploadJobs,
  getUploadJobs,
  getPhotoBlob,
  getTaggingLineConnection,
  markUploadSucceeded,
  scheduleUploadRetry,
} from './storage';
import { uploadSublotPhoto } from './tagging-line';

let active = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export const FAST_POLL_MS = 2500;
export const IDLE_POLL_MS = 30000;
let idle = false;

async function runQueueCycle(): Promise<void> {
  if (active || !navigator.onLine) return;
  active = true;
  try {
    const connection = await getTaggingLineConnection();
    if (!connection.baseUrl || !connection.deviceKey) return;
    const all = await getUploadJobs();
    idle = !all.some((job) => job.status === 'queued');
    const jobs = await getDueUploadJobs();
    const batch = jobs.slice(0, 2);
    await Promise.all(batch.map(async (job) => {
      try {
        const blob = await getPhotoBlob(job.photoId);
        if (!blob) throw new Error('Saved photo blob is missing locally.');
        await uploadSublotPhoto(
          { baseUrl: job.baseUrl, deviceKey: connection.deviceKey },
          job.sublotId,
          job.sequence,
          job.filename,
          blob,
          job.overwrite
        );
        await markUploadSucceeded(job.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        await scheduleUploadRetry(job.id, message);
      }
    }));
  } finally {
    active = false;
  }
}

export function startUploadQueue(): () => void {
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      await runQueueCycle();
      schedule();
    }, idle ? IDLE_POLL_MS : FAST_POLL_MS);
  };
  const wake = () => { idle = false; void runQueueCycle(); schedule(); };
  const onOnline = wake;
  const onSettings = wake;
  window.addEventListener('online', onOnline);
  window.addEventListener('taggingline:settings', onSettings);
  window.addEventListener('taggingline:capture', wake);
  void runQueueCycle();
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('taggingline:settings', onSettings);
    window.removeEventListener('taggingline:capture', wake);
  };
}