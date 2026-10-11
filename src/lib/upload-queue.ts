import {
  getDueUploadJobs,
  getPhotoBlob,
  getTaggingLineConnection,
  markUploadSucceeded,
  scheduleUploadRetry,
} from './storage';
import { uploadSublotPhoto } from './tagging-line';

let active = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function runQueueCycle(): Promise<void> {
  if (active || !navigator.onLine) return;
  active = true;
  try {
    const connection = await getTaggingLineConnection();
    if (!connection.baseUrl || !connection.deviceKey) return;
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
    window.dispatchEvent(new Event('taggingline:uploads'));
  }
}

export function startUploadQueue(): () => void {
  let stopped = false;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await runQueueCycle();
      schedule();
    }, 2500);
  };
  const onOnline = () => { void runQueueCycle(); };
  const onSettings = () => { void runQueueCycle(); };
  window.addEventListener('online', onOnline);
  window.addEventListener('taggingline:settings', onSettings);
  void runQueueCycle();
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('taggingline:settings', onSettings);
  };
}