import type { NexusTool } from '@nexus/shared';

const GITHUB_API = 'https://api.github.com';

function getToken(): string {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }
  return token;
}

async function githubAPI(path: string, method = 'GET', body?: Record<string, unknown>): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Nexus-AI-Assistant',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

interface GitHubError {
  message?: string;
}

const github: NexusTool = {
  name: 'github',
  description: 'Interact with GitHub — list repos, issues, PRs, get issue details, create issues, or search code. Requires GITHUB_TOKEN env var.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_repos', 'list_issues', 'list_prs', 'get_issue', 'create_issue', 'search_code'],
        description: 'The GitHub action to perform',
      },
      repo: {
        type: 'string',
        description: 'Repository in owner/repo format (required for most actions except list_repos and search_code)',
      },
      query: {
        type: 'string',
        description: 'Search query for search_code',
      },
      title: {
        type: 'string',
        description: 'Issue title for create_issue',
      },
      body: {
        type: 'string',
        description: 'Issue body for create_issue',
      },
      state: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        description: 'Filter by state (default: open)',
      },
      issue_number: {
        type: 'number',
        description: 'Issue or PR number for get_issue',
      },
    },
    required: ['action'],
  },

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const action = args['action'] as string;
    const repo = args['repo'] as string | undefined;
    const query = args['query'] as string | undefined;
    const title = args['title'] as string | undefined;
    const body = args['body'] as string | undefined;
    const state = (args['state'] as string) || 'open';
    const issueNumber = args['issue_number'] as number | undefined;

    try {
      switch (action) {
        case 'list_repos': {
          const data = await githubAPI('/user/repos?sort=updated&per_page=20') as Array<{ full_name: string; description: string | null; stargazers_count: number; html_url: string; language: string | null; private: boolean }>;
          if (!Array.isArray(data)) {
            const err = data as GitHubError;
            return `GitHub API error: ${err.message || 'Unknown error'}`;
          }
          return data.map(r => ({
            name: r.full_name,
            description: r.description || '',
            stars: r.stargazers_count,
            url: r.html_url,
            language: r.language || 'unknown',
            private: r.private,
          }));
        }

        case 'list_issues': {
          if (!repo) return 'Error: repo is required for list_issues (format: owner/repo)';
          const data = await githubAPI(`/repos/${repo}/issues?state=${state}&per_page=20`) as Array<{ number: number; title: string; state: string; labels: Array<{ name: string }>; user: { login: string }; created_at: string }>;
          if (!Array.isArray(data)) {
            const err = data as GitHubError;
            return `GitHub API error: ${err.message || 'Unknown error'}`;
          }
          return data
            .filter(i => !('pull_request' in i))
            .map(i => ({
              number: i.number,
              title: i.title,
              state: i.state,
              labels: i.labels.map(l => l.name),
              author: i.user.login,
              created: i.created_at,
            }));
        }

        case 'list_prs': {
          if (!repo) return 'Error: repo is required for list_prs (format: owner/repo)';
          const data = await githubAPI(`/repos/${repo}/pulls?state=${state}&per_page=20`) as Array<{ number: number; title: string; state: string; user: { login: string }; base: { ref: string }; head: { ref: string }; created_at: string }>;
          if (!Array.isArray(data)) {
            const err = data as GitHubError;
            return `GitHub API error: ${err.message || 'Unknown error'}`;
          }
          return data.map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            author: pr.user.login,
            base: pr.base.ref,
            head: pr.head.ref,
            created: pr.created_at,
          }));
        }

        case 'get_issue': {
          if (!repo) return 'Error: repo is required for get_issue (format: owner/repo)';
          if (!issueNumber) return 'Error: issue_number is required for get_issue';
          const data = await githubAPI(`/repos/${repo}/issues/${issueNumber}`) as { number: number; title: string; state: string; body: string | null; labels: Array<{ name: string }>; user: { login: string }; created_at: string; comments: number; message?: string };
          if (data.message) return `GitHub API error: ${data.message}`;
          return {
            number: data.number,
            title: data.title,
            state: data.state,
            body: data.body || '',
            labels: data.labels.map(l => l.name),
            author: data.user.login,
            created: data.created_at,
            comments: data.comments,
          };
        }

        case 'create_issue': {
          if (!repo) return 'Error: repo is required for create_issue (format: owner/repo)';
          if (!title) return 'Error: title is required for create_issue';
          const data = await githubAPI(`/repos/${repo}/issues`, 'POST', {
            title,
            body: body || '',
          }) as { number: number; title: string; html_url: string; message?: string };
          if (data.message) return `GitHub API error: ${data.message}`;
          return {
            success: true,
            number: data.number,
            title: data.title,
            url: data.html_url,
          };
        }

        case 'search_code': {
          if (!query) return 'Error: query is required for search_code';
          const encodedQuery = encodeURIComponent(query);
          const data = await githubAPI(`/search/code?q=${encodedQuery}&per_page=10`) as { items?: Array<{ name: string; path: string; repository: { full_name: string }; html_url: string }>; message?: string };
          if (data.message) return `GitHub API error: ${data.message}`;
          const items = data.items || [];
          return items.map(item => ({
            file: item.name,
            path: item.path,
            repo: item.repository.full_name,
            url: item.html_url,
          }));
        }

        default:
          return `Error: unknown action "${action}". Use list_repos, list_issues, list_prs, get_issue, create_issue, or search_code.`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error calling GitHub API: ${msg}`;
    }
  },
};

export default github;
