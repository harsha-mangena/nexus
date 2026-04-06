import { fetch } from 'undici';
import * as cheerio from 'cheerio';
import type { NexusTool } from '@nexus/shared';

const MAX_CONTENT_LENGTH = 4000;

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
