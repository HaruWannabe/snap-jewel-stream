import JSZip from 'jszip';
import { getAllPhotos, getPhotoBlob } from './storage';

export const EXPORT_BATCH_SIZE = 80;

export type ExportablePhoto = {
  id: string;
  filename: string;
};

function buildZipName(opts: { batchIndex?: number; batchCount?: number }) {
  const date = new Date().toISOString().split('T')[0];
  if (
    typeof opts.batchIndex === 'number' &&
    typeof opts.batchCount === 'number' &&
    opts.batchCount > 1
  ) {
    return `jewellery-photos-${date}-batch-${opts.batchIndex + 1}-of-${opts.batchCount}.zip`;
  }
  return `jewellery-photos-${date}.zip`;
}

async function shareOrDownloadZip(zipBlob: Blob, filename: string) {
  const url = URL.createObjectURL(zipBlob);

  // iOS Safari: prefer share sheet
  if (navigator.share) {
    const file = new File([zipBlob], filename, { type: 'application/zip' });
    const canShareFiles = navigator.canShare?.({ files: [file] });
    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title: 'Jewellery Photos Export',
        });
        URL.revokeObjectURL(url);
        return;
      } catch {
        // User cancelled or share failed; fall back to download
      }
    }
  }

  // Fallback: direct download
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportPhotoBatch(
  photos: ExportablePhoto[],
  opts?: {
    batchIndex?: number;
    batchCount?: number;
    filename?: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<{ success: boolean; count: number; filename: string }> {
  if (photos.length === 0) {
    return { success: false, count: 0, filename: '' };
  }

  const zip = new JSZip();
  const YIELD_EVERY = 10; // allow UI + GC breathing room

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const blob = await getPhotoBlob(photo.id);
    if (blob) {
      zip.file(photo.filename, blob);
    }

    opts?.onProgress?.(i + 1, photos.length);

    if ((i + 1) % YIELD_EVERY === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const filename = opts?.filename || buildZipName({
    batchIndex: opts?.batchIndex,
    batchCount: opts?.batchCount,
  });

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    streamFiles: true,
  });

  await shareOrDownloadZip(zipBlob, filename);
  return { success: true, count: photos.length, filename };
}

// Share all batches sequentially to WhatsApp/Telegram/etc
// Each batch is generated, shared via share sheet, then memory is freed before next batch
export async function exportAndShareAllBatches(
  photos: ExportablePhoto[],
  batchSize: number,
  callbacks?: {
    onBatchStart?: (batchIndex: number, batchCount: number, photosInBatch: number) => void;
    onPhotoProgress?: (current: number, total: number) => void;
    onBatchComplete?: (batchIndex: number) => void;
  }
): Promise<{ success: boolean; batchesShared: number; totalPhotos: number }> {
  if (photos.length === 0) {
    return { success: false, batchesShared: 0, totalPhotos: 0 };
  }

  const batchCount = Math.ceil(photos.length / batchSize);
  let batchesShared = 0;
  let totalPhotosShared = 0;

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, photos.length);
    const batchPhotos = photos.slice(start, end);

    callbacks?.onBatchStart?.(batchIndex, batchCount, batchPhotos.length);

    // Generate this batch's ZIP
    const zip = new JSZip();
    const YIELD_EVERY = 10;

    for (let i = 0; i < batchPhotos.length; i++) {
      const photo = batchPhotos[i];
      const blob = await getPhotoBlob(photo.id);
      if (blob) {
        zip.file(photo.filename, blob);
      }

      callbacks?.onPhotoProgress?.(i + 1, batchPhotos.length);

      if ((i + 1) % YIELD_EVERY === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const filename = buildZipName({ batchIndex, batchCount });
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'STORE',
      streamFiles: true,
    });

    // Try to share via share sheet
    const file = new File([zipBlob], filename, { type: 'application/zip' });
    const canShare = navigator.share && navigator.canShare?.({ files: [file] });

    if (canShare) {
      try {
        await navigator.share({
          files: [file],
          title: `Jewellery Photos - Batch ${batchIndex + 1} of ${batchCount}`,
        });
        batchesShared++;
        totalPhotosShared += batchPhotos.length;
        callbacks?.onBatchComplete?.(batchIndex);
      } catch (err) {
        // User cancelled - stop the process
        if ((err as Error).name === 'AbortError') {
          return { success: batchesShared > 0, batchesShared, totalPhotos: totalPhotosShared };
        }
        // Other error - try to continue with next batch
        console.error(`Failed to share batch ${batchIndex + 1}:`, err);
      }
    } else {
      // Fallback: download if sharing not supported
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      batchesShared++;
      totalPhotosShared += batchPhotos.length;
      callbacks?.onBatchComplete?.(batchIndex);
    }

    // Allow garbage collection before next batch
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { success: true, batchesShared, totalPhotos: totalPhotosShared };
}
