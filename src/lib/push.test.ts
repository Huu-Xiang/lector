import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, native } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  native: {
    requestPushPermission: vi.fn(),
    readPushPermission: vi.fn(),
    registerForPush: vi.fn(),
  },
}));

vi.mock('./api-base', () => ({ apiFetch, lectorMode: () => 'cloud' }));
vi.mock('./native-app', () => native);

import { disableReminder, enableReminder, refreshDevice } from './push';

const ok = () => new Response('{}', { status: 200 });

function calls() {
  return apiFetch.mock.calls.map(([path, init]) => [
    init?.method,
    path,
    init?.body ? JSON.parse(init.body as string) : undefined,
  ]);
}

beforeEach(() => {
  apiFetch.mockReset().mockImplementation(async () => ok());
  native.requestPushPermission.mockReset().mockResolvedValue(true);
  native.readPushPermission.mockReset().mockResolvedValue('granted');
  native.registerForPush.mockReset().mockResolvedValue('tok1');
});

describe('enableReminder', () => {
  it('asks permission, registers the device, then saves the time', async () => {
    expect(await enableReminder('07:30', 'zh-TW')).toBe('ok');
    expect(calls()).toEqual([
      ['POST', '/api/push/devices', { token: 'tok1', environment: 'production', locale: 'zh-TW' }],
      ['PUT', '/api/push/prefs', { enabled: true, time: '07:30' }],
    ]);
  });

  it('saves nothing when the user denies notifications', async () => {
    native.requestPushPermission.mockResolvedValue(false);
    expect(await enableReminder('20:00', 'en')).toBe('denied');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('saves nothing when no token comes back', async () => {
    native.registerForPush.mockResolvedValue(null);
    expect(await enableReminder('20:00', 'en')).toBe('failed');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('disableReminder', () => {
  it('turns the reminder off, then removes the device', async () => {
    expect(await disableReminder('20:00')).toBe(true);
    expect(calls()).toEqual([
      ['PUT', '/api/push/prefs', { enabled: false, time: '20:00' }],
      ['DELETE', '/api/push/devices', { token: 'tok1' }],
    ]);
  });

  it('still turns the reminder off when the permission is gone', async () => {
    native.readPushPermission.mockResolvedValue('denied');
    expect(await disableReminder('20:00')).toBe(true);
    expect(calls()).toEqual([['PUT', '/api/push/prefs', { enabled: false, time: '20:00' }]]);
  });
});

describe('refreshDevice', () => {
  it('registers the token again without asking permission', async () => {
    await refreshDevice('ja');
    expect(native.requestPushPermission).not.toHaveBeenCalled();
    expect(calls()).toEqual([
      ['POST', '/api/push/devices', { token: 'tok1', environment: 'production', locale: 'ja' }],
    ]);
  });

  it('does nothing when the permission is not granted', async () => {
    native.readPushPermission.mockResolvedValue('prompt');
    await refreshDevice('ja');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
