import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTaggingLineQueue,
  getTaggingLineSublot,
  normalizeTaggingLineBaseUrl,
  uploadSublotPhoto,
} from './tagging-line';

describe('Tagging Line client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts only HTTP(S) server addresses and normalizes a trailing slash', () => {
    expect(normalizeTaggingLineBaseUrl(' https://line.example/ ')).toBe('https://line.example');
    expect(() => normalizeTaggingLineBaseUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeTaggingLineBaseUrl('https://user:pass@line.example')).toThrow();
    expect(() => normalizeTaggingLineBaseUrl('https://line.example?key=value')).toThrow();
  });

  it('sends the device key and accepts a direct queue array', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const queue = await getTaggingLineQueue({ baseUrl: 'https://line.example/', deviceKey: 'unit-key' });
    expect(queue).toEqual([]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://line.example/api/public/photo/queue');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-api-key')).toBe('unit-key');
  });

  it('encodes the sublot id and passes the uploaded filename unchanged', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ sublot: { sublot_id: 'lot/a' } }), { status: 200 }));
    await getTaggingLineSublot({ baseUrl: 'https://line.example', deviceKey: 'key' }, 'lot/a');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://line.example/api/public/photo/sublots/lot%2Fa');

    const uploadMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const blob = new Blob(['photo'], { type: 'image/jpeg' });
    await uploadSublotPhoto({ baseUrl: 'https://line.example', deviceKey: 'key' }, 'lot/a', 9, 'AWMS0009.final.jpg', blob, true);
    const [url, options] = uploadMock.mock.calls[0] ?? [];
    expect(url).toBe('https://line.example/api/public/photo/sublots/lot%2Fa/items/9/photo');
    expect(options?.body).toBeInstanceOf(FormData);
    const file = (options?.body as FormData).get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('AWMS0009.final.jpg');
    expect(new Headers(options?.headers).get('x-api-key')).toBe('key');
  });
});