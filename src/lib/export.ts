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

  const filename = buildZipName({
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

// Memory-efficient export that processes photos in small batches
// to avoid crashing on large collections (400+ photos, 1GB+)
export async function exportAllPhotos(
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; count: number }> {
  const photos = await getAllPhotos();
  
  if (photos.length === 0) {
    return { success: false, count: 0 };
  }
  
  const zip = new JSZip();
  const BATCH_SIZE = 10; // legacy single-zip path
  
  // Process photos in batches to avoid memory exhaustion
  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);
    
    // Process batch sequentially to control memory
    for (const photo of batch) {
      const blob = await getPhotoBlob(photo.id);
      if (blob) {
        // Add to zip - JSZip stores reference, not full data yet
        zip.file(photo.filename, blob);
      }
      
      // Report progress
      onProgress?.(Math.min(i + batch.indexOf(photo) + 1, photos.length), photos.length);
    }
    
    // Allow garbage collection between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // Generate ZIP with streaming enabled to reduce peak memory usage
  const zipBlob = await zip.generateAsync(
    { 
      type: 'blob',
      compression: 'STORE', // No compression = faster and less memory
      streamFiles: true // Stream files instead of loading all into memory
    },
    // Progress callback during ZIP generation
    (metadata) => {
      if (metadata.currentFile) {
        onProgress?.(photos.length, photos.length); // Keep showing complete
      }
    }
  );
  
  const filename = buildZipName({});
  await shareOrDownloadZip(zipBlob, filename);
  
  return { success: true, count: photos.length };
}
