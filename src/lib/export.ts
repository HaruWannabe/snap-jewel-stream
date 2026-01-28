import JSZip from 'jszip';
import { getAllPhotos, getPhotoBlob } from './storage';

export async function exportAllPhotos(): Promise<{ success: boolean; count: number }> {
  const photos = await getAllPhotos();
  
  if (photos.length === 0) {
    return { success: false, count: 0 };
  }
  
  const zip = new JSZip();
  
  for (const photo of photos) {
    const blob = await getPhotoBlob(photo.id);
    if (blob) {
      zip.file(photo.filename, blob);
    }
  }
  
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
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
