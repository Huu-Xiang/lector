import { isIP } from 'net';

/** Keeps the first 3 parts of an IPv4 address or the first 48 bits of IPv6, like the Caddy log mask. Returns '' for a non-IP. */
export function shortenIp(raw: string | null | undefined): string {
  const ip = (raw ?? '').trim().split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const candidate = mapped ? mapped[1] : ip;
  const family = isIP(candidate);
  if (family === 4) return `${candidate.split('.').slice(0, 3).join('.')}.0`;
  if (family !== 6) return '';

  const [head, tail] = candidate.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return `${groups
    .slice(0, 3)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::`;
}
