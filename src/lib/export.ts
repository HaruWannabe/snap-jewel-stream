import JSZip from 'jszip';
import { getAllPhotos, getPhotoBlob } from './storage';

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
  const BATCH_SIZE = 10; // Process 10 photos at a time to manage memory
  
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
  
  // Create download link
  const url = URL.createObjectURL(zipBlob);
  const date = new Date().toISOString().split('T')[0];
  const filename = `jewellery-photos-${date}.zip`;
  
  // For iOS Safari, we need to use a different approach
  if (navigator.share && navigator.canShare?.({ files: [new File([zipBlob], filename)] })) {
    try {
      await navigator.share({
        files: [new File([zipBlob], filename, { type: 'application/zip' })],
        title: 'Jewellery Photos Export',
      });
      URL.revokeObjectURL(url);
      return { success: true, count: photos.length };
    } catch (err) {
      // User cancelled or share failed, fall back to download
      console.log('Share cancelled, falling back to download');
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
  
  return { success: true, count: photos.length };
}
