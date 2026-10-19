export const PENDING_INVITE_KEY = 'readfox-pending-invite';

export function readPendingInvite(): string {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writePendingInvite(code: string): void {
  try {
    if (code) localStorage.setItem(PENDING_INVITE_KEY, code);
    else localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* storage can be blocked; the code still travels with the sign-up request */
  }
}
