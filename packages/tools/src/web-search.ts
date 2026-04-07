import type { NexusTool } from '@nexus/shared';

const MAX_CONTENT_LENGTH = 500;

async function tavilySearch(query: string, maxResults: number, topic: string): Promise<string> {
  const apiKey = process.env['TAVILY_API_KEY'];
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY environment variable is not set. Get a key at https://tavily.com');
  }

  // Use @tavily/core SDK
  const { tavily } = await import('@tavily/core');
  const tvly = tavily({ apiKey });

  const response = await tvly.search(query, {
    maxResults: maxResults,
    topic: topic as 'general' | 'news',
    includeAnswer: true,
    searchDepth: 'basic',
  });

  // Format results
  const lines: string[] = [];

  if (response.answer) {
    lines.push(`Answer: ${response.answer}\n`);
  }

  if (response.results && response.results.length > 0) {
    lines.push('Sources:');
    for (const result of response.results) {
      const content = result.content?.slice(0, MAX_CONTENT_LENGTH) ?? '';
      lines.push(`- [${result.title}](${result.url})`);
      if (content) lines.push(`  ${content}`);
    }
  } else {
    lines.push('No results found.');
  }

  return lines.join('\n');
}

// Fallback to DuckDuckGo Lite if Tavily is not configured
async function duckDuckGoSearch(query: string, maxResults: number): Promise<string> {
  const encoded = encodeURIComponent(query);
  const url = `https://lite.duckduckgo.com/lite/?q=${encoded}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Nexus/1.0)',
    },
  });

  if (!response.ok) {
    return `Search failed with status ${response.status}`;
  }

  const html = await response.text();
  // Parse DuckDuckGo Lite results (simple HTML parsing without cheerio)
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const linkRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;
  const snippetRegex = /<td class="result-snippet">(.*?)<\/td>/gs;

  let linkMatch;
  const links: Array<{ url: string; title: string }> = [];
  while ((linkMatch = linkRegex.exec(html)) !== null && links.length < maxResults) {
    links.push({ url: linkMatch[1]!, title: linkMatch[2]!.replace(/<[^>]*>/g, '') });
  }

  let snippetMatch;
  const snippets: string[] = [];
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(snippetMatch[1]!.replace(/<[^>]*>/g, '').trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] || '',
    });
  }

  if (results.length === 0) {
    return 'No results found. Try a different search query.';
  }

  return results
    .map(r => `- [${r.title}](${r.url})\n  ${r.snippet}`)
    .join('\n');
}

const webSearch: NexusTool = {
  name: 'web_search',
  description: 'Search the web for current information, news, or any real-time data. Use this tool when the user asks about current events, recent news, weather, real-time information, or anything that requires up-to-date knowledge beyond your training data. Uses Tavily Search API if TAVILY_API_KEY is set, otherwise falls back to DuckDuckGo.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (default 5, max 10)',
      },
      topic: {
        type: 'string',
        enum: ['general', 'news'],
        description: 'Search topic category (default: general, use news for current events)',
      },
    },
    required: ['query'],
  },

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const query = args['query'] as string;
    const maxResults = Math.min(Number(args['max_results']) || 5, 10);
    const topic = (args['topic'] as string) || 'general';

    if (!query || typeof query !== 'string') {
      return 'Error: query parameter is required';
    }

    try {
      // Try Tavily first if API key is available
      if (process.env['TAVILY_API_KEY']) {
        return await tavilySearch(query, maxResults, topic);
      }
      // Fallback to DuckDuckGo
      return await duckDuckGoSearch(query, maxResults);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If Tavily fails, try DuckDuckGo fallback
      if (process.env['TAVILY_API_KEY']) {
        try {
          return await duckDuckGoSearch(query, maxResults);
        } catch {
          // Both failed
        }
      }
      return `Search error: ${msg}`;
    }
  },
};

export default webSearch;
