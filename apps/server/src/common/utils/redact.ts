/**
 * Partially masks an IP address before it reaches the logs.
 * IPv4 keeps the first two octets, IPv6 keeps the first four groups — enough
 * for abuse triage without retaining a full address.
 */
export function maskIp(ip: string): string {
  if (!ip) {
    return '';
  }

  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      const [a = '', b = ''] = parts;
      return `${a}.${b}.*.*`;
    }
  }

  if (ip.includes(':')) {
    const groups = ip.split(':');
    return `${groups.slice(0, 4).join(':')}:****`;
  }

  return '***';
}
