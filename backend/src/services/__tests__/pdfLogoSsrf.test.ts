import { isPrivateIp, isSafeRemoteUrl } from '../pdfGenerator.js';

// pdfGenerator imports the prisma client — stub it so importing the module has
// no side effects (these tests exercise only the pure SSRF-guard helpers).
jest.mock('../../config/database.js', () => ({ prisma: {} }));

describe('isPrivateIp', () => {
  it('flags private / loopback / link-local / reserved IPv4', () => {
    for (const ip of [
      '0.0.0.0',
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata endpoint
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1',
      '224.0.0.1',
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '172.32.0.1', '93.184.216.34']) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });

  it('flags private / loopback IPv6 and IPv4-mapped', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it('treats non-IP strings as unsafe', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});

describe('isSafeRemoteUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(isSafeRemoteUrl('file:///etc/passwd')).resolves.toBe(false);
    await expect(isSafeRemoteUrl('ftp://example.com/x')).resolves.toBe(false);
    await expect(isSafeRemoteUrl('gopher://example.com')).resolves.toBe(false);
  });

  it('rejects localhost and literal private hosts without a DNS lookup', async () => {
    await expect(isSafeRemoteUrl('http://localhost/logo.png')).resolves.toBe(false);
    await expect(isSafeRemoteUrl('http://127.0.0.1/logo.png')).resolves.toBe(false);
    await expect(isSafeRemoteUrl('http://169.254.169.254/latest/meta-data')).resolves.toBe(false);
    await expect(isSafeRemoteUrl('http://[::1]/logo.png')).resolves.toBe(false);
  });

  it('accepts a literal public IP host', async () => {
    await expect(isSafeRemoteUrl('https://1.1.1.1/logo.png')).resolves.toBe(true);
  });

  it('rejects a malformed URL', async () => {
    await expect(isSafeRemoteUrl('http://')).resolves.toBe(false);
  });
});
