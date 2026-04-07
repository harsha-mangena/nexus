/**
 * Nexus Comprehensive Dry-Run Test
 *
 * Validates:
 *  - Every package default import resolves (not undefined)
 *  - All 9 tools register and have name/description/execute
 *  - datetime, calculator, run_code, fs_write+fs_read execute correctly
 *  - SSRF protection on http_fetch
 *  - web_search DuckDuckGo fallback (no TAVILY_API_KEY)
 *  - slack/github graceful failure without tokens
 *  - Full app bootstrap simulation
 */

import { strict as assert } from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = (name) => path.join(__dirname, 'packages', name, 'dist', 'index.js');

// Clear env vars that would cause side effects
delete process.env.TAVILY_API_KEY;
delete process.env.SLACK_BOT_TOKEN;
delete process.env.SLACK_TOKEN;
delete process.env.GITHUB_TOKEN;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  return fn()
    .then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed++;
      failures.push({ name, error: err.message || String(err) });
      console.log(`  ✗ ${name}: ${err.message || err}`);
    });
}

// ═══════════════════════════════════════════════
// 1. Package imports
// ═══════════════════════════════════════════════
console.log('\n═══ 1. Package Imports ═══');

const sharedMod = await import(pkg('shared'));
const toolsMod = await import(pkg('tools'));
const coreMod = await import(pkg('core'));
const memoryMod = await import(pkg('memory'));
const routerMod = await import(pkg('router'));
const providersMod = await import(pkg('providers'));
const voiceMod = await import(pkg('voice'));
const channelsMod = await import(pkg('channels'));

await test('@nexus/shared exports resolve', async () => {
  assert.ok(sharedMod.loadConfig, 'loadConfig');
  assert.ok(sharedMod.logger, 'logger');
  assert.ok(sharedMod.NexusError, 'NexusError');
});

await test('@nexus/tools exports resolve', async () => {
  assert.ok(toolsMod.ToolRegistry, 'ToolRegistry');
  assert.ok(toolsMod.webSearch, 'webSearch');
  assert.ok(toolsMod.httpFetch, 'httpFetch');
  assert.ok(toolsMod.runCode, 'runCode');
  assert.ok(toolsMod.datetime, 'datetime');
  assert.ok(toolsMod.calculator, 'calculator');
  assert.ok(toolsMod.slack, 'slack');
  assert.ok(toolsMod.github, 'github');
  assert.ok(toolsMod.createFsTools, 'createFsTools');
});

await test('@nexus/core exports resolve', async () => {
  assert.ok(coreMod.Gateway, 'Gateway');
  assert.ok(coreMod.AgentOrchestrator, 'AgentOrchestrator');
  assert.ok(coreMod.ResponseFormatter, 'ResponseFormatter');
});

await test('@nexus/memory exports resolve', async () => {
  assert.ok(memoryMod.SQLiteStore, 'SQLiteStore');
  assert.ok(memoryMod.ConversationManager, 'ConversationManager');
});

await test('@nexus/router exports resolve', async () => {
  assert.ok(routerMod.IntentClassifier, 'IntentClassifier');
  assert.ok(routerMod.ModelSelector, 'ModelSelector');
  assert.ok(routerMod.DEFAULT_ROUTES, 'DEFAULT_ROUTES');
});

await test('@nexus/providers exports resolve', async () => {
  assert.ok(providersMod.ProviderRegistry, 'ProviderRegistry');
  assert.ok(providersMod.createOpenAIProvider, 'createOpenAIProvider');
  assert.ok(providersMod.createGoogleProvider, 'createGoogleProvider');
  assert.ok(providersMod.createOllamaProvider, 'createOllamaProvider');
});

await test('@nexus/voice exports resolve', async () => {
  assert.ok(voiceMod.WhisperClient, 'WhisperClient');
  assert.ok(voiceMod.PiperClient, 'PiperClient');
  assert.ok(voiceMod.VoicePipeline, 'VoicePipeline');
});

await test('@nexus/channels exports resolve', async () => {
  assert.ok(channelsMod.BaseAdapter, 'BaseAdapter');
  assert.ok(channelsMod.TelegramAdapter, 'TelegramAdapter');
  assert.ok(channelsMod.DiscordAdapter, 'DiscordAdapter');
  assert.ok(channelsMod.SlackAdapter, 'SlackAdapter');
  assert.ok(channelsMod.WhatsAppAdapter, 'WhatsAppAdapter');
  assert.ok(channelsMod.CLIAdapter, 'CLIAdapter');
});

// ═══════════════════════════════════════════════
// 2. Tool Registry — all 9 tools
// ═══════════════════════════════════════════════
console.log('\n═══ 2. Tool Registry ═══');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
const allToolNames = [
  'web_search', 'http_fetch', 'run_code', 'datetime',
  'calculator', 'slack', 'github', 'fs_read', 'fs_write',
];

const registry = toolsMod.ToolRegistry.createDefaultTools(allToolNames, [tmpDir]);

await test('Registry has all 9 tools', async () => {
  const tools = registry.getAll();
  assert.equal(tools.length, 9, `Expected 9 tools, got ${tools.length}`);
});

await test('Each tool has name, description, execute', async () => {
  for (const name of allToolNames) {
    const tool = registry.get(name);
    assert.ok(tool, `Tool ${name} not found`);
    assert.equal(typeof tool.name, 'string', `${name}.name`);
    assert.ok(tool.name.length > 0, `${name}.name not empty`);
    assert.equal(typeof tool.description, 'string', `${name}.description`);
    assert.ok(tool.description.length > 0, `${name}.description not empty`);
    assert.equal(typeof tool.execute, 'function', `${name}.execute`);
  }
});

// ═══════════════════════════════════════════════
// 3. Tool Executions
// ═══════════════════════════════════════════════
console.log('\n═══ 3. Tool Executions ═══');

// datetime
await test('datetime returns current date', async () => {
  const tool = registry.get('datetime');
  const result = await tool.execute({});
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
  assert.ok(result.includes('2026') || result.includes('202'), `datetime result: ${result}`);
});

// calculator (2+2)
await test('calculator: 2+2 = 4', async () => {
  const tool = registry.get('calculator');
  const result = await tool.execute({ expression: '2+2' });
  assert.equal(typeof result, 'string');
  assert.ok(result.includes('4'), `Expected 4 in: ${result}`);
});

// run_code (JS: console.log(42))
await test('run_code: JS console.log(42)', async () => {
  const tool = registry.get('run_code');
  const result = await tool.execute({ language: 'javascript', code: 'console.log(42)' });
  assert.equal(typeof result, 'string');
  assert.ok(result.includes('42'), `Expected 42 in: ${result}`);
});

// fs_write + fs_read
await test('fs_write + fs_read round-trip', async () => {
  const testFile = path.join(tmpDir, 'test-file.txt');
  const testContent = 'Hello from Nexus dry-run test!';

  const writeTool = registry.get('fs_write');
  const writeResult = await writeTool.execute({ path: testFile, content: testContent });
  assert.equal(typeof writeResult, 'string');
  assert.ok(writeResult.includes('Successfully'), `Write result: ${writeResult}`);

  const readTool = registry.get('fs_read');
  const readResult = await readTool.execute({ path: testFile });
  assert.equal(readResult, testContent);
});

// ═══════════════════════════════════════════════
// 4. SSRF protection on http_fetch
// ═══════════════════════════════════════════════
console.log('\n═══ 4. SSRF Protection ═══');

await test('http_fetch blocks localhost', async () => {
  const tool = registry.get('http_fetch');
  const result = await tool.execute({ url: 'http://127.0.0.1/admin' });
  assert.equal(typeof result, 'string');
  assert.ok(
    result.includes('Blocked') || result.includes('private') || result.includes('Error'),
    `Expected SSRF block, got: ${result}`
  );
});

await test('http_fetch blocks metadata endpoint', async () => {
  const tool = registry.get('http_fetch');
  const result = await tool.execute({ url: 'http://169.254.169.254/latest/meta-data/' });
  assert.equal(typeof result, 'string');
  assert.ok(
    result.includes('Blocked') || result.includes('private') || result.includes('Error'),
    `Expected SSRF block, got: ${result}`
  );
});

await test('http_fetch blocks non-http protocol', async () => {
  const tool = registry.get('http_fetch');
  const result = await tool.execute({ url: 'file:///etc/passwd' });
  assert.equal(typeof result, 'string');
  assert.ok(result.includes('Error'), `Expected protocol error, got: ${result}`);
});

// ═══════════════════════════════════════════════
// 5. web_search DuckDuckGo fallback (no Tavily key)
// ═══════════════════════════════════════════════
console.log('\n═══ 5. Web Search (DuckDuckGo Fallback) ═══');

await test('web_search works without TAVILY_API_KEY (DDG fallback)', async () => {
  delete process.env.TAVILY_API_KEY;
  const tool = registry.get('web_search');
  const result = await tool.execute({ query: 'test' });
  assert.equal(typeof result, 'string');
  // Should not error about TAVILY_API_KEY
  assert.ok(!result.includes('TAVILY_API_KEY'), `Should not require Tavily key, got: ${result}`);
});

// ═══════════════════════════════════════════════
// 6. Slack/GitHub graceful failure without tokens
// ═══════════════════════════════════════════════
console.log('\n═══ 6. Graceful Failure Without Tokens ═══');

await test('slack fails gracefully without SLACK_BOT_TOKEN', async () => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_TOKEN;
  const tool = registry.get('slack');
  const result = await tool.execute({ action: 'list_channels' });
  assert.equal(typeof result, 'string');
  assert.ok(
    result.includes('SLACK_BOT_TOKEN') || result.includes('Error'),
    `Expected graceful error, got: ${result}`
  );
});

await test('github fails gracefully without GITHUB_TOKEN', async () => {
  delete process.env.GITHUB_TOKEN;
  const tool = registry.get('github');
  const result = await tool.execute({ action: 'list_repos' });
  assert.equal(typeof result, 'string');
  assert.ok(
    result.includes('GITHUB_TOKEN') || result.includes('Error'),
    `Expected graceful error, got: ${result}`
  );
});

// ═══════════════════════════════════════════════
// 7. App Bootstrap Simulation
// ═══════════════════════════════════════════════
console.log('\n═══ 7. App Bootstrap Simulation ═══');

await test('Full bootstrap: all components instantiate', async () => {
  // Router
  const classifier = new routerMod.IntentClassifier();
  const classification = classifier.classify('Hello world', false);
  assert.ok(classification.intent, 'Classification has intent');
  assert.ok(classification.confidence >= 0, 'Classification has confidence');

  // Tools
  const tools = toolsMod.ToolRegistry.createDefaultTools(
    ['datetime', 'calculator', 'web_search'],
    []
  );
  const enabled = tools.getEnabled();
  assert.equal(enabled.length, 3, `Expected 3 enabled tools, got ${enabled.length}`);

  // Voice
  const voice = new voiceMod.VoicePipeline(undefined, undefined);
  assert.ok(voice, 'VoicePipeline created');

  // Response formatter
  const formatter = new coreMod.ResponseFormatter();
  const formatted = formatter.formatForChannel('**bold** text', 'telegram');
  assert.equal(typeof formatted, 'string');
  assert.ok(formatted.length > 0, 'Formatted text is non-empty');
});

// ═══════════════════════════════════════════════
// Cleanup & Summary
// ═══════════════════════════════════════════════
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch { /* ignore */ }

console.log(`\n${'═'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.error}`);
  }
}
console.log('═'.repeat(40));

process.exit(failed > 0 ? 1 : 0);
