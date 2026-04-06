import { execSync } from 'node:child_process';
import type { NexusTool } from '@nexus/shared';

const MAX_OUTPUT_LENGTH = 2000;
const TIMEOUT_MS = 10_000;

type SupportedLanguage = 'javascript' | 'python' | 'bash';

const LANGUAGE_COMMANDS: Record<SupportedLanguage, (code: string) => string> = {
  javascript: (code) => `node -e ${JSON.stringify(code)}`,
  python: (code) => `python3 -c ${JSON.stringify(code)}`,
  bash: (code) => `bash -c ${JSON.stringify(code)}`,
};

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return text.slice(0, MAX_OUTPUT_LENGTH) + `\n[Output truncated — ${text.length} total characters]`;
}

const runCode: NexusTool = {
  name: 'run_code',
  description: 'Execute a code snippet in a sandboxed environment. Supports JavaScript (Node.js), Python 3, and Bash. Returns the combined stdout and stderr output.',
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

    if (!(language in LANGUAGE_COMMANDS)) {
      return `Error: Unsupported language '${language}'. Supported languages: ${Object.keys(LANGUAGE_COMMANDS).join(', ')}`;
    }

    const buildCommand = LANGUAGE_COMMANDS[language as SupportedLanguage];
    const command = buildCommand(code);

    try {
      const stdout = execSync(command, {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      return truncate(stdout);
    } catch (error) {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        const execError = error as Error & { stdout: string; stderr: string; status?: number };
        const stdout = execError.stdout ?? '';
        const stderr = execError.stderr ?? '';
        const combined = [stdout, stderr].filter(Boolean).join('\n');
        const status = execError.status !== undefined ? ` (exit code ${execError.status})` : '';
        return truncate(`Execution failed${status}:\n${combined}`);
      }

      const message = error instanceof Error ? error.message : String(error);
      return `Error executing code: ${message}`;
    }
  },
};

export default runCode;
