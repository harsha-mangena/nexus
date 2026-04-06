import { fetch } from 'undici';
import * as cheerio from 'cheerio';
import type { NexusTool } from '@nexus/shared';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const webSearch: NexusTool = {
  name: 'web_search',
  description: 'Search the web using DuckDuckGo and return relevant results. Use this to find current information, news, documentation, or answers to factual questions.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up',
      },
    },
    required: ['query'],
  },
  async execute(args: Record<string, unknown>): Promise<unknown> {
    const query = args['query'] as string;

    if (!query || typeof query !== 'string') {
      return 'Error: query parameter is required and must be a string';
    }

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        return `Error: DuckDuckGo returned status ${response.status}`;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];

      $('.result').each((_i, element) => {
        if (results.length >= 5) return false;

        const titleEl = $(element).find('.result__title a');
        const snippetEl = $(element).find('.result__snippet');

        const title = titleEl.text().trim();
        const rawUrl = titleEl.attr('href') ?? '';
        const snippet = snippetEl.text().trim();

        if (!title || !rawUrl) return;

        // DuckDuckGo wraps URLs — extract the actual URL from uddg param
        let resolvedUrl = rawUrl;
        try {
          const parsed = new URL(rawUrl, 'https://html.duckduckgo.com');
          const uddg = parsed.searchParams.get('uddg');
          if (uddg) {
            resolvedUrl = decodeURIComponent(uddg);
          }
        } catch {
          // keep rawUrl as-is
        }

        results.push({ title, url: resolvedUrl, snippet });
      });

      if (results.length === 0) {
        return 'No results found for the given query.';
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error performing web search: ${message}`;
    }
  },
};

export default webSearch;
