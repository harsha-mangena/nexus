import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NexusTool } from '@nexus/shared';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_LENGTH = 2000;
const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1024 * 1024; // 1MB

type SupportedLanguage = 'javascript' | 'python' | 'bash';

// Use execFile with explicit args to prevent shell injection
const LANGUAGE_EXECUTORS: Record<SupportedLanguage, { cmd: string; buildArgs: (code: string) => string[] }> = {
  javascript: {
    cmd: 'node',
    buildArgs: (code) => ['--no-addons', '--no-warnings', '--disallow-code-generation-from-strings', '-e', code],
  },
  python: {
    cmd: 'python3',
    buildArgs: (code) => ['-c', code],
  },
  bash: {
    cmd: 'bash',
    buildArgs: (code) => ['-c', code],
  },
};

// Minimal safe environment
const SAFE_ENV: Record<string, string> = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/tmp',
  LANG: 'en_US.UTF-8',
  NODE_ENV: 'production',
};

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return text.slice(0, MAX_OUTPUT_LENGTH) + `\n[Output truncated — ${text.length} total characters]`;
}

const runCode: NexusTool = {
  name: 'run_code',
  description: 'Execute a code snippet in a sandboxed environment. Supports JavaScript (Node.js), Python 3, and Bash. Returns the combined stdout and stderr output. WARNING: This tool runs code directly on the host — enable only in trusted environments.',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'python', 'bash'],
        description: 'The programming language of the code snippet',
      },
      code: {
        type: 'string',
        description: 'The code snippet to execute',
      },
    },
    required: ['language', 'code'],
  },
  async execute(args: Record<string, unknown>): Promise<unknown> {
    const language = args['language'] as string;
    const code = args['code'] as string;

    if (!language || typeof language !== 'string') {
      return 'Error: language parameter is required and must be a string';
    }
    if (!code || typeof code !== 'string') {
      return 'Error: code parameter is required and must be a string';
    }
    if (!(language in LANGUAGE_EXECUTORS)) {
      return `Error: Unsupported language '${language}'. Supported: ${Object.keys(LANGUAGE_EXECUTORS).join(', ')}`;
    }

    const executor = LANGUAGE_EXECUTORS[language as SupportedLanguage];

    try {
      const { stdout, stderr } = await execFileAsync(executor.cmd, executor.buildArgs(code), {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: SAFE_ENV,
        cwd: '/tmp',
      });

      const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
      return truncate(combined || '(no output)');
    } catch (error) {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string; code?: number | string };
        const combined = [execError.stdout, execError.stderr].filter(Boolean).join('\n').trim();
        const exitInfo = execError.code !== undefined ? ` (exit code ${execError.code})` : '';
        return truncate(`Execution failed${exitInfo}:\n${combined}`);
      }
      const message = error instanceof Error ? error.message : String(error);
      return `Error executing code: ${message}`;
    }
  },
};

export default runCode;
