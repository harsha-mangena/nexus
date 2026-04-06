import type { NexusTool } from '@nexus/shared';

// Allow: digits, operators, parentheses, dots, spaces, and Math.* identifiers
const SAFE_EXPRESSION_RE = /^[0-9+\-*/%.() e\t\nMathsqrtabsceilflooroundPIlogpowminmax,]*$/;

function safeEval(expression: string): number {
  // Strip all whitespace for the safety check but evaluate the original
  if (!SAFE_EXPRESSION_RE.test(expression)) {
    throw new Error('Expression contains disallowed characters. Only numbers, basic operators (+, -, *, /, %, **), parentheses, and Math functions are allowed.');
  }

  // Create a restricted scope — only expose Math
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
