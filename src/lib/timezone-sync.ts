import { getSetting, setSetting } from './data-layer';
import { isValidTimeZone } from './dates';

interface TimeZoneSyncDeps {
  read: () => Promise<unknown>;
  write: (zone: string) => Promise<unknown>;
  browserZone: () => string | undefined;
}

const liveDeps: TimeZoneSyncDeps = {
  read: () => getSetting<string | null>('timezone'),
  write: (zone) => setSetting('timezone', zone),
  browserZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Saves the browser's zone as the day-rollover zone when the account has none.
 * Any stored value, even '' (the Time Zone page's "Auto"), is the user's choice.
 */
export async function syncBrowserTimeZone(deps: TimeZoneSyncDeps = liveDeps): Promise<boolean> {
  try {
    const zone = deps.browserZone();
    if (!zone || !isValidTimeZone(zone)) return false;
    // Only a null answer means "never set"; undefined is a failed read.
    if ((await deps.read()) !== null) return false;
    await deps.write(zone);
    return true;
  } catch {
    return false;
  }
}
