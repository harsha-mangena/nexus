import type { NexusTool } from '@nexus/shared';

// Allowed tokens: numbers, operators, parens, dots, commas, spaces, and specific Math.* identifiers
const ALLOWED_TOKENS_RE = /^(\s|\d+\.?\d*|[+\-*/%(),.]|\*\*|Math\.(sqrt|abs|ceil|floor|round|log|pow|min|max|PI|E|sin|cos|tan|atan2))*$/;

// Blocklist: known dangerous identifiers that must never appear
const DANGEROUS_RE = /\b(process|require|import|eval|Function|global|globalThis|this|window|document|setTimeout|setInterval|fetch|XMLHttpRequest|Proxy|Reflect|constructor|__proto__|prototype)\b/;

function safeEval(expression: string): number {
  // Safety: reject dangerous identifiers first
  if (DANGEROUS_RE.test(expression)) {
    throw new Error('Expression contains disallowed identifiers. Only numbers, basic operators (+, -, *, /, %, **), parentheses, and Math functions are allowed.');
  }

  // Safety: only allow known-safe tokens
  if (!ALLOWED_TOKENS_RE.test(expression)) {
    throw new Error('Expression contains disallowed characters. Only numbers, basic operators (+, -, *, /, %, **), parentheses, and Math functions are allowed.');
  }

  // Create a restricted scope — only expose Math, with null prototype to prevent prototype access
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('Math', `"use strict"; return (${expression});`);
  const result: unknown = fn(Math);

  if (typeof result !== 'number') {
    throw new Error(`Expression did not evaluate to a number (got ${typeof result})`);
  }

  if (!isFinite(result)) {
    if (isNaN(result)) throw new Error('Expression evaluated to NaN');
    throw new Error('Expression evaluated to Infinity');
  }

  return result;
}

const calculator: NexusTool = {
  name: 'calculator',
  description: 'Safely evaluate a mathematical expression and return the result. Supports arithmetic operators (+, -, *, /, %, **), parentheses, and JavaScript Math functions (e.g. Math.sqrt, Math.abs, Math.pow, Math.PI).',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'The mathematical expression to evaluate, e.g. "2 + 2", "Math.sqrt(144)", "(3 ** 2) + (4 ** 2)"',
      },
    },
    required: ['expression'],
  },
  async execute(args: Record<string, unknown>): Promise<unknown> {
    const expression = args['expression'] as string;

    if (!expression || typeof expression !== 'string') {
      return 'Error: expression parameter is required and must be a string';
    }

    const trimmed = expression.trim();
    if (trimmed.length === 0) {
      return 'Error: expression must not be empty';
    }

    try {
      const result = safeEval(trimmed);
      // Format: avoid unnecessary decimals for whole numbers
      const formatted = Number.isInteger(result) ? result.toString() : result.toPrecision(10).replace(/\.?0+$/, '');
      return `${trimmed} = ${formatted}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error evaluating expression: ${message}`;
    }
  },
};

export default calculator;
