import { isIP } from 'net';

/**
 * Keeps the network part of an address: the first three parts of an IPv4
 * address (203.0.113.0) and the first 48 bits of an IPv6 address
 * (2001:db8:1::). Matches the Caddy access-log mask. Returns '' for anything
 * that is not an IP address.
 */
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
