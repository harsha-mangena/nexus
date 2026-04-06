import type { ClassificationResult, IntentCategory } from '@nexus/shared';

const INTENT_KEYWORDS: Record<Exclude<IntentCategory, 'VOICE' | 'SIMPLE'>, string[]> = {
  CODE: [
    'code', 'function', 'bug', 'debug', 'error', 'implement', 'refactor', 'api', 'class',
    'type', 'import', 'compile', 'build', 'deploy', 'regex', 'sql', 'query', 'git', 'commit',
    'merge', 'pull request', 'pr', 'test', 'unit test', 'lint', 'typescript', 'javascript',
    'python', 'react', 'node', 'express', 'docker', 'kubernetes', 'aws', 'gcp', 'database',
    'schema', 'migration', 'endpoint', 'rest', 'graphql', 'component', 'hook', 'state',
    'props', 'async', 'await', 'promise', 'callback', 'algorithm', 'data structure', 'sort',
    'search', 'binary', 'tree', 'hash', 'stack', 'queue', 'fix', 'patch', 'review',
    'optimize', 'performance',
  ],
  ANALYSIS: [
    'analyze', 'research', 'compare', 'summarize', 'explain', 'statistics', 'data', 'report',
    'study', 'evaluate', 'assess', 'review', 'breakdown', 'insight', 'trend', 'metrics',
    'benchmark', 'overview', 'pros and cons', 'tradeoff',
  ],
  CREATIVE: [
    'write', 'draft', 'compose', 'create', 'story', 'poem', 'essay', 'blog', 'article',
    'brainstorm', 'idea', 'name', 'slogan', 'tagline', 'marketing', 'copy', 'content',
    'script', 'outline',
  ],
  AGENTIC: [
    'search the web', 'find online', 'look up', 'fetch', 'download', 'read this url', 'browse',
    'check website', 'open', 'save file', 'write file', 'create file', 'run', 'execute',
    'schedule', 'remind me', 'set alarm', 'calculate',
  ],
};

export class IntentClassifier {
  classify(text: string, hasVoiceAttachment: boolean): ClassificationResult {
    if (hasVoiceAttachment) {
      return { intent: 'VOICE', confidence: 1.0, reasoning: 'Voice attachment detected' };
    }

    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 0);
    const totalWords = Math.max(words.length, 1);

    let bestIntent: IntentCategory = 'SIMPLE';
    let bestConfidence = 0;
    let bestMatches = 0;

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [
      Exclude<IntentCategory, 'VOICE' | 'SIMPLE'>,
      string[],
    ][]) {
      let matches = 0;

      for (const keyword of keywords) {
        if (keyword.includes(' ')) {
          // Multi-word keyword: match as phrase
          if (lower.includes(keyword)) {
            matches++;
          }
        } else {
          // Single-word keyword: match whole words
          if (words.includes(keyword)) {
            matches++;
          }
        }
      }

      const confidence = matches / totalWords;

      if (matches > bestMatches || (matches === bestMatches && confidence > bestConfidence)) {
        bestMatches = matches;
        bestConfidence = confidence;
        bestIntent = intent;
      }
    }

    if (bestMatches === 0) {
      return { intent: 'SIMPLE', confidence: 1.0, reasoning: 'No keywords matched; defaulting to SIMPLE' };
    }

    return {
      intent: bestIntent,
      confidence: bestConfidence,
      reasoning: `Matched ${bestMatches} keyword(s) for intent ${bestIntent}`,
    };
  }
}
