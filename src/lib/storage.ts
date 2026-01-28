import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PhotoMetadata {
  id: string;
  filename: string;
  prefix: string;
  tagNumber: string;
  timestamp: number;
  date: string; // YYYY-MM-DD for daily counting
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
}

let db: IDBPDatabase<JewelryDBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<JewelryDBSchema>> {
  if (db) return db;
  
  db = await openDB<JewelryDBSchema>('jewelry-photos', 1, {
    upgrade(database) {
      // Photos metadata store
      const photoStore = database.createObjectStore('photos', { keyPath: 'id' });
      photoStore.createIndex('by-filename', 'filename', { unique: true });
      photoStore.createIndex('by-date', 'date', { unique: false });
      
      // Blobs store for actual images
      database.createObjectStore('blobs', { keyPath: undefined });
      
      // Settings store
      database.createObjectStore('settings', { keyPath: undefined });
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

export async function checkFilenameExists(prefix: string, tagNumber: string): Promise<boolean> {
  const database = await getDB();
  const filename = `${prefix}${tagNumber}.jpg`;
  const existing = await database.getFromIndex('photos', 'by-filename', filename);
  return !!existing;
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
