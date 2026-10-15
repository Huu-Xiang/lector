/** `xianghu@gmail.com` becomes `xi***@gmail.com`. The domain stays visible. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const keep = local.length > 3 ? 2 : 1;
  return `${local.slice(0, keep)}***${email.slice(at)}`;
}
