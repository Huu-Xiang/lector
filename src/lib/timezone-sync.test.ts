import { describe, expect, it, vi } from 'vitest';

vi.mock('./data-layer', () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));

import { syncBrowserTimeZone } from './timezone-sync';

function deps(stored: unknown, zone?: string) {
  return {
    read: vi.fn().mockResolvedValue(stored),
    write: vi.fn().mockResolvedValue('timezone'),
    browserZone: () => zone,
  };
}

describe('syncBrowserTimeZone', () => {
  it('saves the browser zone when the setting was never set', async () => {
    const d = deps(null, 'Asia/Shanghai');
    expect(await syncBrowserTimeZone(d)).toBe(true);
    expect(d.write).toHaveBeenCalledWith('Asia/Shanghai');
  });

  it('keeps a zone the user chose', async () => {
    const d = deps('Europe/Paris', 'Asia/Shanghai');
    expect(await syncBrowserTimeZone(d)).toBe(false);
    expect(d.write).not.toHaveBeenCalled();
  });

  it('keeps the empty value that the Auto choice stores', async () => {
    const d = deps('', 'Asia/Shanghai');
    expect(await syncBrowserTimeZone(d)).toBe(false);
    expect(d.write).not.toHaveBeenCalled();
  });

  it('writes nothing when the read failed', async () => {
    const d = deps(undefined, 'Asia/Shanghai');
    expect(await syncBrowserTimeZone(d)).toBe(false);
    expect(d.write).not.toHaveBeenCalled();
  });

  it('writes nothing for a zone the browser reports wrongly', async () => {
    for (const zone of [undefined, '', 'Not/AZone']) {
      const d = deps(null, zone);
      expect(await syncBrowserTimeZone(d)).toBe(false);
      expect(d.write).not.toHaveBeenCalled();
    }
  });

  it('stays silent when the write fails', async () => {
    const d = deps(null, 'Asia/Shanghai');
    d.write.mockRejectedValue(new Error('offline'));
    expect(await syncBrowserTimeZone(d)).toBe(false);
  });
});
