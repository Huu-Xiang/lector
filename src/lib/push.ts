import { apiFetch } from './api-base';
import { readPushPermission, registerForPush, requestPushPermission } from './native-app';

export interface ReminderPrefs {
  enabled: boolean;
  time: string;
}

export type EnableResult = 'ok' | 'denied' | 'failed';

/** TestFlight and App Store builds use the production APNs host. */
const ENVIRONMENT = 'production';

function send(method: string, path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function loadReminderPrefs(): Promise<ReminderPrefs | null> {
  const res = await apiFetch('/api/push/prefs');
  return res.ok ? ((await res.json()) as ReminderPrefs) : null;
}

export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<boolean> {
  return (await send('PUT', '/api/push/prefs', prefs)).ok;
}

async function saveDevice(token: string, locale: string): Promise<boolean> {
  return (await send('POST', '/api/push/devices', { token, environment: ENVIRONMENT, locale })).ok;
}

/** Asks permission, saves the device token and the time. */
export async function enableReminder(time: string, locale: string): Promise<EnableResult> {
  if (!(await requestPushPermission())) return 'denied';
  const token = await registerForPush();
  if (!token) return 'failed';
  if (!(await saveDevice(token, locale))) return 'failed';
  return (await saveReminderPrefs({ enabled: true, time })) ? 'ok' : 'failed';
}

/** Stops the sends first, then removes this phone's token. */
export async function disableReminder(time: string): Promise<boolean> {
  if (!(await saveReminderPrefs({ enabled: false, time }))) return false;
  if ((await readPushPermission()) === 'granted') {
    const token = await registerForPush();
    if (token) await send('DELETE', '/api/push/devices', { token });
  }
  return true;
}

/** Saves the current token and locale again; never asks for permission. */
export async function refreshDevice(locale: string): Promise<void> {
  if ((await readPushPermission()) !== 'granted') return;
  const token = await registerForPush();
  if (token) await saveDevice(token, locale);
}
