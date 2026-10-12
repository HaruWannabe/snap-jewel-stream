import { describe, it, expect, vi } from 'vitest';
import { nextUploadRetryState, MAX_UPLOAD_ATTEMPTS } from './storage';
import { getFinishState, uploadSublotPhoto } from './tagging-line';

describe('upload rules', () => {
  it('stops retrying after 8 attempts', () => {
    expect(MAX_UPLOAD_ATTEMPTS).toBe(8);
    expect(nextUploadRetryState(6).status).toBe('queued');
    expect(nextUploadRetryState(7).status).toBe('failed');
  });
  it('blocks finishing while uploads are queued', () => {
    expect(getFinishState(2, 1, 0).disabled).toBe(true);
  });
  it('allows finishing with only failed uploads, behind a confirmation', () => {
    expect(getFinishState(0, 3, 0)).toMatchObject({ disabled: false, needsConfirm: true });
  });
  it('enables "Finish anyway" when remaining are skipped', () => {
    expect(getFinishState(0, 0, 2)).toMatchObject({ label: 'Finish anyway (remaining are skipped)', disabled: false });
  });
  it('first upload has no overwrite flag', async () => {
    const m = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await uploadSublotPhoto({ baseUrl: 'https://l.example', deviceKey: 'k' }, 's', 1, 'a.jpg', new Blob(['x']), false);
    expect(m.mock.calls[0]?.[0]).toBe('https://l.example/api/public/photo/sublots/s/items/1/photo');
  });
});
