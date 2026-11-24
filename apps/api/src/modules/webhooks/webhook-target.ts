import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface ResolvedWebhookTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function hostnameFromUrl(url: URL): string {
  return url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
}

function ipv4Number(address: string): bigint {
  return address.split('.').reduce((result, part) => (result << 8n) | BigInt(part), 0n);
}

function inIpv4Range(address: string, network: string, prefix: number): boolean {
  const shift = BigInt(32 - prefix);
  return ipv4Number(address) >> shift === ipv4Number(network) >> shift;
}

function isLoopback(address: string, family: number): boolean {
  return family === 4 ? inIpv4Range(address, '127.0.0.0', 8) : address.toLowerCase() === '::1';
}

function isPrivateOrReserved(address: string, family: number): boolean {
  if (family === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([network, prefix]) => inIpv4Range(address, String(network), Number(prefix)));
  }

  const normalized = address.toLowerCase().split('%')[0] ?? '';
  return (
    !/^[23][0-9a-f]{0,3}:/i.test(normalized) ||
    normalized.startsWith('2001:0:') ||
    normalized.startsWith('2001:2:') ||
    normalized.startsWith('2001:db8:') ||
    normalized.startsWith('2001:10:') ||
    normalized.startsWith('2001:20:') ||
    normalized.startsWith('2002:') ||
    normalized.startsWith('3fff:')
  );
}

export async function resolveWebhookTarget(rawUrl: string): Promise<ResolvedWebhookTarget> {
  const url = new URL(rawUrl);
  const environment = process.env.NODE_ENV;
  const allowLoopback = environment === 'test' || environment === 'development';

  if (url.username || url.password || url.hash) {
    throw new Error('Webhook URL cannot contain credentials or a fragment');
  }
  if (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:')) {
    throw new Error('Webhook URLs must use HTTPS');
  }

  const hostname = hostnameFromUrl(url);
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('Webhook hostname did not resolve to an address');
  }

  const permitted = addresses.filter(record => {
    const loopback = isLoopback(record.address, record.family);
    if (allowLoopback && loopback) {
      return true;
    }
    return !isPrivateOrReserved(record.address, record.family);
  });

  if (permitted.length !== addresses.length) {
    throw new Error('Webhook URL resolves to a private or reserved network address');
  }

  const target = permitted[0];
  if (!target) {
    throw new Error('Webhook hostname did not resolve to a permitted address');
  }

  return {
    url,
    address: target.address,
    family: target.family as 4 | 6,
  };
}

export async function postWebhookRequest(
  target: ResolvedWebhookTarget,
  headers: Record<string, string>,
  body: string,
): Promise<{ statusCode: number; body: string }> {
  const secure = target.url.protocol === 'https:';
  const transport = secure ? httpsRequest : httpRequest;
  const defaultPort = secure ? 443 : 80;

  return new Promise((resolve, reject) => {
    let responseBody = '';
    const req = transport(
      {
        protocol: target.url.protocol,
        hostname: target.address,
        family: target.family,
        port: Number(target.url.port || defaultPort),
        path: `${target.url.pathname}${target.url.search}`,
        method: 'POST',
        headers: {
          ...headers,
          Host: target.url.host,
          'Content-Length': Buffer.byteLength(body),
        },
        ...(secure && isIP(hostnameFromUrl(target.url)) === 0
          ? { servername: hostnameFromUrl(target.url) }
          : {}),
      },
      response => {
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          if (responseBody.length < 8192) {
            responseBody += chunk.slice(0, 8192 - responseBody.length);
          }
        });
        response.on('end', () => {
          clearTimeout(timeout);
          resolve({ statusCode: response.statusCode ?? 0, body: responseBody });
        });
      },
    );

    const timeout = setTimeout(() => req.destroy(new Error('Webhook request timed out')), 5000);
    req.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    req.end(body);
  });
}
