import { apiFetch } from './api-base';

/** Null when the server has no product-mail switch for this account. */
export async function getProductEmails(): Promise<boolean | null> {
  const res = await apiFetch('/api/email/preferences');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Could not read product emails');
  const body = (await res.json()) as { productEmails: boolean };
  return body.productEmails;
}

export async function setProductEmails(productEmails: boolean): Promise<void> {
  const res = await apiFetch('/api/email/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productEmails }),
  });
  if (!res.ok) throw new Error('Could not save product emails');
}
