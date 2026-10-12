import type { TaggingLineConnection } from './storage';

export interface TaggingLineQueueEntry {
  sublot_id: string;
  lot_no: string;
  sublot_no: number;
  branch_code: string;
  compcode: string;
  ic: string;
  product_name: string;
  total_items: number;
  done_count: number;
  skipped_count: number;
  pending_count: number;
  sealed_at: string;
}

export interface TaggingLineTray {
  tray_code: string;
  rows: number;
  columns: number;
}

export interface TaggingLineItem {
  sequence: number;
  tray_code: string;
  compartment_no: number;
  ser_no: number;
  filename: string;
  pcs: number;
  status: 'pending' | 'done' | 'skipped';
  skip_reason?: string;
  photographed_at: string | null;
}

export interface TaggingLineSublot {
  sublot_id: string;
  lot_no: string;
  sublot_no: number;
  compcode: string;
  ic: string;
  product_name: string;
  status: string;
  total_items: number;
  done_count: number;
  skipped_count: number;
  trays: TaggingLineTray[];
  items: TaggingLineItem[];
}

export class TaggingLineError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TaggingLineError';
    this.status = status;
  }
}

export function canFinishSublot(queuedUploads: number): boolean {
  return queuedUploads === 0;
}

/** Label and enabled state for the finish button always come from the same decision. */
export function getFinishState(queued: number, failed: number, skipped: number): { label: string; disabled: boolean; needsConfirm: boolean } {
  if (queued > 0) return { label: `Waiting for ${queued} upload${queued === 1 ? '' : 's'}`, disabled: true, needsConfirm: false };
  if (failed > 0) return { label: `Finish anyway (${failed} not uploaded)`, disabled: false, needsConfirm: true };
  if (skipped > 0) return { label: 'Finish anyway (remaining are skipped)', disabled: false, needsConfirm: false };
  return { label: 'Finish sublot', disabled: false, needsConfirm: false };
}

export function normalizeTaggingLineBaseUrl(value: string): string {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Server URL must begin with http:// or https://');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Server address cannot include login details, a query, or a fragment.');
  }
  return parsed.toString().replace(/\/$/, '');
}

async function apiRequest<T>(
  connection: TaggingLineConnection,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = normalizeTaggingLineBaseUrl(connection.baseUrl);
  if (!connection.deviceKey.trim()) throw new Error('Enter the device key in Settings.');
  const headers = new Headers(init.headers);
  headers.set('x-api-key', connection.deviceKey.trim());
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;
    throw new TaggingLineError(message, response.status);
  }
  return payload as T;
}

export async function getTaggingLineQueue(connection: TaggingLineConnection): Promise<TaggingLineQueueEntry[]> {
  const payload = await apiRequest<{ sublots?: TaggingLineQueueEntry[]; queue?: TaggingLineQueueEntry[]; data?: TaggingLineQueueEntry[] } | TaggingLineQueueEntry[]>(connection, '/api/public/photo/queue');
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.sublots)) return payload.sublots;
  if (Array.isArray(payload.queue)) return payload.queue;
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function testTaggingLineConnection(connection: TaggingLineConnection): Promise<number> {
  const queue = await getTaggingLineQueue(connection);
  return queue.length;
}

export async function getTaggingLineSublot(
  connection: TaggingLineConnection,
  sublotId: string
): Promise<TaggingLineSublot> {
  const payload = await apiRequest<TaggingLineSublot | { sublot: TaggingLineSublot; data?: TaggingLineSublot } | { data: TaggingLineSublot }>(
    connection,
    `/api/public/photo/sublots/${encodeURIComponent(sublotId)}`
  );
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid sublot response.');
  const outer = payload as unknown as Record<string, unknown>;
  const inner = ('sublot' in payload && payload.sublot) || ('data' in payload && payload.data) || payload;
  const merged = { ...outer, ...(inner as object) } as TaggingLineSublot & Record<string, unknown>;
  if (!merged.product_name && typeof outer.product_name === 'string') merged.product_name = outer.product_name;
  merged.trays = Array.isArray(merged.trays) ? merged.trays : [];
  merged.items = Array.isArray(merged.items) ? merged.items : [];
  return merged;
}

export async function uploadSublotPhoto(
  connection: TaggingLineConnection,
  sublotId: string,
  sequence: number,
  filename: string,
  blob: Blob,
  overwrite: boolean
): Promise<{ ok: boolean; sequence: number; filename: string; done_count: number; skipped_count: number; total: number }> {
  const form = new FormData();
  form.append('file', blob, filename);
  return apiRequest(
    connection,
    `/api/public/photo/sublots/${encodeURIComponent(sublotId)}/items/${sequence}/photo${overwrite ? '?overwrite=true' : ''}`,
    { method: 'POST', body: form }
  );
}

export async function skipSublotItem(
  connection: TaggingLineConnection,
  sublotId: string,
  sequence: number,
  reason: string
): Promise<unknown> {
  return apiRequest(
    connection,
    `/api/public/photo/sublots/${encodeURIComponent(sublotId)}/items/${sequence}/skip`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }
  );
}

export async function completeTaggingLineSublot(
  connection: TaggingLineConnection,
  sublotId: string
): Promise<unknown> {
  return apiRequest(
    connection,
    `/api/public/photo/sublots/${encodeURIComponent(sublotId)}/complete`,
    { method: 'POST' }
  );
}