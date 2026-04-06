import { fetch } from 'undici';
import * as dns from 'node:dns';
import * as cheerio from 'cheerio';
import type { NexusTool } from '@nexus/shared';

const MAX_CONTENT_LENGTH = 4000;

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.gcp.internal',
  'instance-data',
]);

function isPrivateIP(ip: string): boolean {
  // IPv4
  const parts = ip.split('.').map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;                                    // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;              // 192.168.0.0/16
    if (parts[0] === 127) return true;                                    // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true;              // 169.254.0.0/16 (link-local + metadata)
    if (parts[0] === 0) return true;                                      // 0.0.0.0/8
  }
  // IPv6
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;  // fc00::/7
  if (ip.startsWith('fe80')) return true;                         // fe80::/10
  return false;
}

async function validateUrl(url: string): Promise<void> {
  const parsed = new URL(url);

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${parsed.protocol}. Only http and https are allowed.`);
  }

  // Blocked hostnames
  if (BLOCKED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Blocked host: ${parsed.hostname}`);
  }

  // Resolve DNS and check IP
  try {
    const { address } = await dns.promises.lookup(parsed.hostname);
    if (isPrivateIP(address)) {
      throw new Error(`Blocked: URL resolves to private/internal IP address`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Blocked')) throw err;
    throw new Error(`DNS resolution failed for ${parsed.hostname}`);
  }
}

const httpFetch: NexusTool = {
  name: 'http_fetch',
  description: 'Fetch the content of a URL and return its text content. Strips HTML tags and returns readable text. Useful for reading web pages, documentation, or any HTTP endpoint.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from',
      },
    },
    required: ['url'],
  },
  async execute(args: Record<string, unknown>): Promise<unknown> {
    const url = args['url'] as string;

    if (!url || typeof url !== 'string') {
      return 'Error: url parameter is required and must be a string';
    }

    try {
      new URL(url); // validate URL format
    } catch {
      return `Error: Invalid URL: ${url}`;
    }

    // SSRF protection: validate URL before fetching
    try {
      await validateUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText} for URL: ${url}`;
      }

      const contentType = response.headers.get('content-type') ?? '';
      const rawBody = await response.text();

      let text: string;

      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        const $ = cheerio.load(rawBody);

        // Remove non-content elements
        $('script, style, noscript, nav, footer, header, aside, [aria-hidden="true"]').remove();

        // Prefer main content areas
        const mainContent = $('main, article, [role="main"], #main, #content, .content').first();
        text = (mainContent.length > 0 ? mainContent : $('body')).text();

        // Normalise whitespace
        text = text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');
      } else {
        // Plain text, JSON, XML, etc.
        text = rawBody;
      }

      if (text.length > MAX_CONTENT_LENGTH) {
        text = text.slice(0, MAX_CONTENT_LENGTH) + `\n\n[Content truncated — ${text.length} total characters]`;
      }

      return text || 'No text content found at the given URL.';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error fetching URL: ${message}`;
    }
  },
};

export default httpFetch;
