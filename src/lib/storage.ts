import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PhotoMetadata {
  id: string;
  filename: string;
  prefix: string;
  tagNumber: string;
  timestamp: number;
  date: string; // YYYY-MM-DD for daily counting
  connectedSublotId?: string;
  connectedSequence?: number;
  connectedLotNo?: string;
  connectedSublotNo?: number;
  connectedTrayCode?: string;
  connectedCompartmentNo?: number;
}

export interface TaggingLineConnection {
  baseUrl: string;
  deviceKey: string;
}

export interface PhotoUploadJob {
  id: string;
  sublotId: string;
  sequence: number;
  photoId: string;
  filename: string;
  baseUrl: string;
  overwrite: boolean;
  status: 'queued' | 'uploaded' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
}

interface JewelryDBSchema extends DBSchema {
  photos: {
    key: string;
    value: PhotoMetadata;
    indexes: {
      'by-filename': string;
      'by-date': string;
    };
  };
  blobs: {
    key: string;
    value: Blob;
  };
  settings: {
    key: string;
    value: unknown;
  };
  uploadQueue: {
    key: string;
    value: PhotoUploadJob;
    indexes: {
      'by-sublot': string;
      'by-status': string;
    };
  };
}

let db: IDBPDatabase<JewelryDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<JewelryDBSchema>> {
  if (db) return db;
  
  db = await openDB<JewelryDBSchema>('jewelry-photos', 2, {
    upgrade(database) {
      // Existing v1 stores and records are intentionally left untouched.
      if (!database.objectStoreNames.contains('photos')) {
        const photoStore = database.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('by-filename', 'filename', { unique: true });
        photoStore.createIndex('by-date', 'date', { unique: false });
      }
      if (!database.objectStoreNames.contains('blobs')) {
        database.createObjectStore('blobs', { keyPath: undefined });
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: undefined });
      }
      if (!database.objectStoreNames.contains('uploadQueue')) {
        const uploadStore = database.createObjectStore('uploadQueue', { keyPath: 'id' });
        uploadStore.createIndex('by-sublot', 'sublotId', { unique: false });
        uploadStore.createIndex('by-status', 'status', { unique: false });
      }
    },
  });
  
  return db;
}

export async function savePhoto(
  blob: Blob,
  prefix: string,
  tagNumber: string,
  overwrite: boolean = false
): Promise<{ success: boolean; filename: string; exists?: boolean }> {
  const database = await getDB();
  const filename = `${prefix}${tagNumber}.jpg`;
  
  // Check for existing
  const existing = await database.getFromIndex('photos', 'by-filename', filename);
  if (existing && !overwrite) {
    return { success: false, filename, exists: true };
  }
  
  const id = existing?.id || crypto.randomUUID();
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  
  const metadata: PhotoMetadata = {
    id,
    filename,
    prefix,
    tagNumber,
    timestamp: now.getTime(),
    date,
  };
  
  // Save metadata and blob in transaction
  const tx = database.transaction(['photos', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('photos').put(metadata),
    tx.objectStore('blobs').put(blob, id),
    tx.done,
  ]);
  
  return { success: true, filename };
}

/** Saves with the exact server-supplied filename and atomically queues its upload. */
export async function saveConnectedPhoto(
  blob: Blob,
  filename: string,
  options: { sublotId: string; sequence: number; baseUrl: string; overwrite: boolean; lotNo?: string; sublotNo?: number; trayCode?: string; compartmentNo?: number }
): Promise<{ success: boolean; exists?: boolean; conflict?: boolean; photoId?: string }> {
  const database = await getDB();
  const existing = await database.getFromIndex('photos', 'by-filename', filename);
  if (existing && (existing.connectedSublotId !== options.sublotId || existing.connectedSequence !== options.sequence)) {
    return { success: false, exists: true, conflict: true };
  }
  if (existing && !options.overwrite) return { success: false, exists: true };

  const photoId = existing?.id || crypto.randomUUID();
  const now = new Date();
  const metadata: PhotoMetadata = {
    id: photoId,
    filename,
    prefix: existing?.prefix || '',
    tagNumber: existing?.tagNumber || '',
    timestamp: now.getTime(),
    date: now.toISOString().slice(0, 10),
    connectedSublotId: options.sublotId,
    connectedSequence: options.sequence,
    connectedLotNo: options.lotNo,
    connectedSublotNo: options.sublotNo,
    connectedTrayCode: options.trayCode,
    connectedCompartmentNo: options.compartmentNo,
  };
  const job: PhotoUploadJob = {
    id: `${options.sublotId}:${options.sequence}`,
    sublotId: options.sublotId,
    sequence: options.sequence,
    photoId,
    filename,
    baseUrl: options.baseUrl,
    overwrite: options.overwrite,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now.getTime(),
    createdAt: now.getTime(),
  };

  const tx = database.transaction(['photos', 'blobs', 'uploadQueue'], 'readwrite');
  await Promise.all([
    tx.objectStore('photos').put(metadata),
    tx.objectStore('blobs').put(blob, photoId),
    tx.objectStore('uploadQueue').put(job),
    tx.done,
  ]);
  window.dispatchEvent(new Event('taggingline:capture'));
  return { success: true, photoId };
}

export async function getTaggingLineConnection(): Promise<TaggingLineConnection> {
  const database = await getDB();
  const value = await database.get('settings', 'taggingLineConnection');
  if (!value || typeof value !== 'object') return { baseUrl: '', deviceKey: '' };
  const connection = value as Partial<TaggingLineConnection>;
  return {
    baseUrl: typeof connection.baseUrl === 'string' ? connection.baseUrl : '',
    deviceKey: typeof connection.deviceKey === 'string' ? connection.deviceKey : '',
  };
}

export async function saveTaggingLineConnection(connection: TaggingLineConnection): Promise<void> {
  const database = await getDB();
  await database.put('settings', connection, 'taggingLineConnection');
  window.dispatchEvent(new Event('taggingline:settings'));
}

export async function getUploadJobs(sublotId?: string): Promise<PhotoUploadJob[]> {
  const database = await getDB();
  if (sublotId) return database.getAllFromIndex('uploadQueue', 'by-sublot', sublotId);
  return database.getAll('uploadQueue');
}

export async function getDueUploadJobs(now = Date.now()): Promise<PhotoUploadJob[]> {
  const jobs = await getDB().then((database) => database.getAllFromIndex('uploadQueue', 'by-status', 'queued'));
  return jobs.filter((job) => job.nextAttemptAt <= now).sort((a, b) => a.createdAt - b.createdAt);
}

export async function markUploadSucceeded(jobId: string): Promise<void> {
  const database = await getDB();
  const job = await database.get('uploadQueue', jobId);
  if (!job) return;
  await database.put('uploadQueue', { ...job, status: 'uploaded', lastError: undefined });
  window.dispatchEvent(new Event('taggingline:uploads'));
}

export const MAX_UPLOAD_ATTEMPTS = 8;

/** Decides the next state of a job after a failed attempt: retry with capped backoff, or stop as 'failed'. */
export function nextUploadRetryState(previousAttempts: number, now = Date.now()): { status: 'queued' | 'failed'; attempts: number; nextAttemptAt: number } {
  const attempts = previousAttempts + 1;
  if (attempts >= MAX_UPLOAD_ATTEMPTS) return { status: 'failed', attempts, nextAttemptAt: now };
  const delay = Math.min(1000 * (2 ** Math.min(attempts - 1, 8)), 5 * 60 * 1000);
  return { status: 'queued', attempts, nextAttemptAt: now + delay };
}

export async function scheduleUploadRetry(jobId: string, error: string): Promise<void> {
  const database = await getDB();
  const job = await database.get('uploadQueue', jobId);
  if (!job) return;
  await database.put('uploadQueue', {
    ...job,
    ...nextUploadRetryState(job.attempts),
    lastError: error.slice(0, 300),
  });
  window.dispatchEvent(new Event('taggingline:uploads'));
}

/** Puts a failed job back in the queue with a fresh attempt count. */
export async function retryUploadJob(jobId: string): Promise<void> {
  const database = await getDB();
  const job = await database.get('uploadQueue', jobId);
  if (!job) return;
  await database.put('uploadQueue', { ...job, status: 'queued', attempts: 0, nextAttemptAt: Date.now() });
  window.dispatchEvent(new Event('taggingline:uploads'));
  window.dispatchEvent(new Event('taggingline:capture'));
}

/** Drops only the upload job; the locally saved photo and its image stay untouched. */
export async function discardUploadJob(jobId: string): Promise<void> {
  const database = await getDB();
  await database.delete('uploadQueue', jobId);
  window.dispatchEvent(new Event('taggingline:uploads'));
}

export async function getSublotPhotos(sublotId: string): Promise<PhotoMetadata[]> {
  const all = await getAllPhotos();
  return all.filter((photo) => photo.connectedSublotId === sublotId);
}

export async function checkFilenameExists(prefix: string, tagNumber: string): Promise<boolean> {
  const database = await getDB();
  const filename = `${prefix}${tagNumber}.jpg`;
  const existing = await database.getFromIndex('photos', 'by-filename', filename);
  return !!existing;
}

export async function checkExactFilenameExists(filename: string): Promise<boolean> {
  const database = await getDB();
  return Boolean(await database.getFromIndex('photos', 'by-filename', filename));
}

export async function isFilenameOwnedByConnectedItem(
  filename: string,
  sublotId: string,
  sequence: number
): Promise<boolean> {
  const database = await getDB();
  const photo = await database.getFromIndex('photos', 'by-filename', filename);
  return photo?.connectedSublotId === sublotId && photo.connectedSequence === sequence;
}

export async function getTodayCount(): Promise<number> {
  const database = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const photos = await database.getAllFromIndex('photos', 'by-date', today);
  return photos.length;
}

export async function getAllPhotos(): Promise<PhotoMetadata[]> {
  const database = await getDB();
  return database.getAll('photos');
}

export type { PhotoMetadata };

export async function renamePhoto(
  id: string,
  newTagNumber: string
): Promise<{ success: boolean; exists?: boolean }> {
  const database = await getDB();
  
  // Get existing photo
  const photo = await database.get('photos', id);
  if (!photo) {
    return { success: false };
  }
  
  const newFilename = `${photo.prefix}${newTagNumber}.jpg`;
  
  // Check if new filename already exists (different photo)
  const existing = await database.getFromIndex('photos', 'by-filename', newFilename);
  if (existing && existing.id !== id) {
    return { success: false, exists: true };
  }
  
  // Update metadata
  const updatedPhoto: PhotoMetadata = {
    ...photo,
    tagNumber: newTagNumber,
    filename: newFilename,
  };
  
  await database.put('photos', updatedPhoto);
  return { success: true };
}

export async function deletePhoto(id: string): Promise<void> {
  const database = await getDB();
  const tx = database.transaction(['photos', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('photos').delete(id),
    tx.objectStore('blobs').delete(id),
    tx.done,
  ]);
}

export async function getPhotoBlob(id: string): Promise<Blob | undefined> {
  const database = await getDB();
  return database.get('blobs', id);
}

export async function deleteAllPhotos(): Promise<void> {
  const database = await getDB();
  const tx = database.transaction(['photos', 'blobs'], 'readwrite');
  await Promise.all([
    tx.objectStore('photos').clear(),
    tx.objectStore('blobs').clear(),
    tx.done,
  ]);
}

export async function getStorageUsage(): Promise<{ count: number; sizeBytes: number }> {
  const database = await getDB();
  const photos = await database.getAll('photos');
  const count = photos.length;
  
  let sizeBytes = 0;
  for (const photo of photos) {
    const blob = await database.get('blobs', photo.id);
    if (blob) {
      sizeBytes += blob.size;
    }
  }
  
  return { count, sizeBytes };
}

// Settings management
const DEFAULT_PREFIXES = [
  { code: 'AWNC', name: 'Necklace' },
  { code: 'AWRG', name: 'Ring' },
  { code: 'AWBG', name: 'Bangle' },
];

export interface PrefixItem {
  code: string;
  name: string;
}

export async function getPrefixes(): Promise<PrefixItem[]> {
  const database = await getDB();
  const prefixes = await database.get('settings', 'prefixes');
  return (prefixes as PrefixItem[]) || DEFAULT_PREFIXES;
}

export async function savePrefixes(prefixes: PrefixItem[]): Promise<void> {
  const database = await getDB();
  await database.put('settings', prefixes, 'prefixes');
}
