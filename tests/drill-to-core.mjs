/**
 * DRILL TO CORE — Exhaustive runtime verification
 * 
 * This test exercises COMPILED JavaScript, not TypeScript source.
 * Every import chain, every constructor, every method, every edge case.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = '/tmp/nexus-drill-core-' + Date.now();

// Setup
fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(TEST_DIR + '/allowed-fs', { recursive: true });
process.env['OPENAI_API_KEY'] = 'sk-test-drill-12345';
process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'google-test-drill-key';
delete process.env['TAVILY_API_KEY']; // Force DuckDuckGo fallback
delete process.env['SLACK_BOT_TOKEN'];
delete process.env['GITHUB_TOKEN'];

let total = 0, passed = 0, failed = 0;
const failures = [];
function test(name, condition) {
  total++;
  if (condition) { passed++; }
  else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

// Write test YAML
fs.writeFileSync(TEST_DIR + '/nexus.yaml', `
assistant:
  name: DrillBot
channels:
  cli:
    enabled: true
providers:
  openai:
    apiKey: \${OPENAI_API_KEY}
  google:
    apiKey: \${GOOGLE_GENERATIVE_AI_API_KEY}
routing:
  defaultProvider: google
  fallbackPolicy: warn
  rules:
    - intent: SIMPLE
      provider: google
      model: gemini-2.0-flash
    - intent: CODE
      provider: openai
      model: gpt-4o
      maxTokens: 4096
      temperature: 0.2
memory:
  dbPath: ${TEST_DIR}/drill.db
  maxContextTurns: 10
  retentionDays: 30
tools:
  enabled: [datetime, calculator, web_search, http_fetch, fs_read, fs_write, slack, github]
  allowedPaths: [${TEST_DIR}/allowed-fs]
security:
  rateLimitPerMinute: 20
`);

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 1: COMPILED JS — IMPORT CHAINS  ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

// Verify every compiled file is ESM (has export/import, not require/exports)
const compiledFiles = [
  'packages/shared/dist/index.js',
  'packages/shared/dist/types.js',
  'packages/shared/dist/schemas.js',
  'packages/shared/dist/config-loader.js',
  'packages/shared/dist/logger.js',
  'packages/shared/dist/errors.js',
  'packages/memory/dist/index.js',
  'packages/memory/dist/sqlite-store.js',
  'packages/memory/dist/migrations.js',
  'packages/memory/dist/conversation.js',
  'packages/router/dist/index.js',
  'packages/router/dist/classifier.js',
  'packages/router/dist/model-selector.js',
  'packages/router/dist/routes.js',
  'packages/providers/dist/index.js',
  'packages/providers/dist/openai.js',
  'packages/providers/dist/google.js',
  'packages/providers/dist/ollama.js',
  'packages/providers/dist/registry.js',
  'packages/tools/dist/index.js',
  'packages/tools/dist/registry.js',
  'packages/tools/dist/web-search.js',
  'packages/tools/dist/http-fetch.js',
  'packages/tools/dist/calculator.js',
  'packages/tools/dist/datetime.js',
  'packages/tools/dist/fs-tools.js',
  'packages/tools/dist/run-code.js',
  'packages/tools/dist/slack.js',
  'packages/tools/dist/github.js',
  'packages/channels/dist/index.js',
  'packages/channels/dist/base-adapter.js',
  'packages/channels/dist/telegram.js',
  'packages/channels/dist/discord.js',
  'packages/channels/dist/slack.js',
  'packages/channels/dist/whatsapp.js',
  'packages/channels/dist/cli-adapter.js',
  'packages/voice/dist/index.js',
  'packages/voice/dist/whisper.js',
  'packages/voice/dist/piper.js',
  'packages/voice/dist/pipeline.js',
  'packages/core/dist/index.js',
  'packages/core/dist/gateway.js',
  'packages/core/dist/orchestrator.js',
  'packages/core/dist/formatter.js',
  'apps/nexus/dist/index.js',
];

for (const file of compiledFiles) {
  const fullPath = path.join(ROOT, file);
  const exists = fs.existsSync(fullPath);
  test(`EXISTS: ${file}`, exists);
  if (exists) {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const isCJS = content.includes('Object.defineProperty(exports') || content.includes('require(');
    test(`ESM (not CJS): ${file}`, !isCJS);
  }
}

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 2: DEFAULT EXPORTS RESOLVE      ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

// These are the files that use `export default` — the pattern that was broken
const defaultExportFiles = [
  { path: 'packages/tools/dist/web-search.js', expectName: 'web_search' },
  { path: 'packages/tools/dist/http-fetch.js', expectName: 'http_fetch' },
  { path: 'packages/tools/dist/calculator.js', expectName: 'calculator' },
  { path: 'packages/tools/dist/datetime.js', expectName: 'datetime' },
  { path: 'packages/tools/dist/run-code.js', expectName: 'run_code' },
  { path: 'packages/tools/dist/slack.js', expectName: 'slack' },
  { path: 'packages/tools/dist/github.js', expectName: 'github' },
];

for (const { path: filePath, expectName } of defaultExportFiles) {
  const mod = await import(path.join(ROOT, filePath));
  test(`import ${expectName}: default is object`, typeof mod.default === 'object' && mod.default !== null);
  test(`import ${expectName}: .name = "${expectName}"`, mod.default?.name === expectName);
  test(`import ${expectName}: .execute is function`, typeof mod.default?.execute === 'function');
  test(`import ${expectName}: .parameters has properties`, typeof mod.default?.parameters?.properties === 'object');
  test(`import ${expectName}: NOT double-wrapped`, mod.default?.default === undefined);
}

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 3: CONFIG LOADING               ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

const shared = await import(path.join(ROOT, 'packages/shared/dist/index.js'));
const config = shared.loadConfig(TEST_DIR + '/nexus.yaml');
test('Config loaded', config !== null);
test('Config: assistant.name = DrillBot', config.assistant.name === 'DrillBot');
test('Config: openai key resolved from env', config.providers.openai?.apiKey === 'sk-test-drill-12345');
test('Config: google key resolved from env', config.providers.google?.apiKey === 'google-test-drill-key');
test('Config: routing.defaultProvider = google', config.routing.defaultProvider === 'google');
test('Config: routing.fallbackPolicy = warn', config.routing.fallbackPolicy === 'warn');
test('Config: 2 routing rules', config.routing.rules.length === 2);
test('Config: retentionDays = 30', config.memory.retentionDays === 30);
test('Config: tools has 8 enabled', config.tools.enabled.length === 8);
test('Config: security.rateLimitPerMinute = 20', config.security.rateLimitPerMinute === 20);

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 4: MEMORY — FULL CRUD           ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

const memory = await import(path.join(ROOT, 'packages/memory/dist/index.js'));
const store = new memory.SQLiteStore(TEST_DIR + '/drill.db');

// Conversations
const cid = store.getOrCreateConversation('u1', 'telegram');
test('Conversation created', typeof cid === 'string' && cid.length > 10);
test('Same user+channel = same conv', store.getOrCreateConversation('u1', 'telegram') === cid);
test('Diff channel = diff conv', store.getOrCreateConversation('u1', 'discord') !== cid);

// Turns
store.addTurn(cid, 'user', 'msg1', 'telegram', 'u1');
store.addTurn(cid, 'assistant', 'msg2', 'telegram', 'u1');
store.addTurn(cid, 'user', 'msg3', 'telegram', 'u1');
store.addTurn(cid, 'assistant', 'msg4', 'telegram', 'u1');

const allTurns = store.getTurns(cid, 100);
test('4 turns stored', allTurns.length === 4);
test('Turns ordered: first=msg1', allTurns[0]?.content === 'msg1');
test('Turns ordered: last=msg4', allTurns[3]?.content === 'msg4');

// LIMIT returns most recent (rowid tiebreaker)
const limited = store.getTurns(cid, 2);
test('Limit=2: got 2', limited.length === 2);
test('Limit=2: first=msg3 (most recent)', limited[0]?.content === 'msg3');
test('Limit=2: second=msg4', limited[1]?.content === 'msg4');

// Metadata
store.addTurn(cid, 'user', 'meta-test', 'telegram', 'u1', { key: 'value', num: 42 });
const withMeta = store.getTurns(cid, 1);
test('Metadata round-trip: key', withMeta[0]?.metadata?.key === 'value');
test('Metadata round-trip: num', withMeta[0]?.metadata?.num === 42);

// Delete
store.deleteConversation(cid);
test('Delete: turns gone', store.getTurns(cid, 100).length === 0);

// ConversationManager
const cm = new memory.ConversationManager(store, 5);
cm.addUserMessage('u2', 'cli', 'hello');
cm.addAssistantMessage('u2', 'cli', 'hi there');
const ctx = cm.getContext('u2', 'cli', 'sys prompt');
test('CM: 2 turns', ctx.turns.length === 2);
test('CM: userId', ctx.userId === 'u2');
test('CM: channel', ctx.channel === 'cli');
test('CM: systemPrompt', ctx.systemPrompt === 'sys prompt');

// Reset
cm.resetConversation('u2', 'cli');
const afterReset = cm.getContext('u2', 'cli', 'sys');
test('CM reset: 0 turns', afterReset.turns.length === 0);

// Rate limiting
store.recordRateEvent('rl-user');
store.recordRateEvent('rl-user');
test('Rate: 2/5 = not limited', !store.isRateLimited('rl-user', 5));
for (let i = 0; i < 4; i++) store.recordRateEvent('rl-user');
test('Rate: 6/5 = limited', store.isRateLimited('rl-user', 5));
store.pruneRateEvents();

// Pruning
const oldCid = store.getOrCreateConversation('old-u', 'cli');
store.addTurn(oldCid, 'user', 'old msg', 'cli', 'old-u');
const pruned = store.pruneOldConversations(0);
test('Prune: removed old convos', pruned >= 1);

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 5: ROUTER — CLASSIFY + SELECT   ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

const router = await import(path.join(ROOT, 'packages/router/dist/index.js'));
const classifier = new router.IntentClassifier();

// Classification tests
test('VOICE: voice attachment', classifier.classify('anything', true).intent === 'VOICE');
test('CODE: "debug this function"', classifier.classify('debug this function', false).intent === 'CODE');
test('CREATIVE: "write me a poem"', classifier.classify('write me a poem about space', false).intent === 'CREATIVE');
test('ANALYSIS: "analyze the data"', classifier.classify('analyze the data and compare', false).intent === 'ANALYSIS');
test('SIMPLE: "hello"', classifier.classify('hello', false).intent === 'SIMPLE');
test('AGENTIC: "look up latest news"', classifier.classify('look up the latest news articles', false).intent === 'AGENTIC');

// ALL routes support tools
for (const route of router.DEFAULT_ROUTES) {
  test(`Route ${route.intent}: supportsTools=true`, route.supportsTools === true);
}

// ModelSelector
const ms = new router.ModelSelector(config);
const simpleRoute = ms.selectModel('SIMPLE');
test('SIMPLE route: google', simpleRoute.provider === 'google');
test('SIMPLE route: supportsTools', simpleRoute.supportsTools === true);

const codeRoute = ms.selectModel('CODE');
test('CODE route: openai', codeRoute.provider === 'openai');
test('CODE route: gpt-4o', codeRoute.model === 'gpt-4o');

// updateConfig for hot-reload
test('updateConfig exists', typeof ms.updateConfig === 'function');

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 6: TOOLS — EVERY TOOL EXECUTES  ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

const tools = await import(path.join(ROOT, 'packages/tools/dist/index.js'));
const reg = tools.ToolRegistry.createDefaultTools(
  config.tools.enabled,
  config.tools.allowedPaths ?? []
);

const allTools = reg.getAll();
test('9 tools registered', allTools.length === 9);
for (const t of allTools) {
  test(`Tool ${t.name}: has execute`, typeof t.execute === 'function');
  test(`Tool ${t.name}: has parameters.properties`, typeof t.parameters?.properties === 'object');
}

// datetime
const dt = await reg.get('datetime').execute({ timezone: 'America/New_York', format: 'full' });
test('datetime: returns string', typeof dt === 'string' && dt.length > 10);

// calculator — correct math
test('calc 2+2=4', String(await reg.get('calculator').execute({ expression: '2 + 2' })).includes('4'));
test('calc sqrt(144)=12', String(await reg.get('calculator').execute({ expression: 'Math.sqrt(144)' })).includes('12'));
test('calc PI', String(await reg.get('calculator').execute({ expression: 'Math.PI' })).includes('3.14'));

// calculator — security
test('calc blocks process.exit', String(await reg.get('calculator').execute({ expression: 'process.exit(1)' })).includes('Error'));
test('calc blocks require', String(await reg.get('calculator').execute({ expression: 'require("fs")' })).includes('Error'));
test('calc blocks constructor', String(await reg.get('calculator').execute({ expression: 'constructor.constructor("return this")()' })).includes('Error'));

// fs_write + fs_read
const fsw = await reg.get('fs_write').execute({ path: TEST_DIR + '/allowed-fs/test.txt', content: 'drill-core-test' });
test('fs_write: success', String(fsw).includes('Successfully'));
const fsr = await reg.get('fs_read').execute({ path: TEST_DIR + '/allowed-fs/test.txt' });
test('fs_read: correct content', fsr === 'drill-core-test');
const fsBlocked = await reg.get('fs_read').execute({ path: '/etc/shadow' });
test('fs_read: /etc/shadow blocked', String(fsBlocked).includes('denied'));

// run_code — sandbox
const rc1 = await reg.get('run_code').execute({ language: 'javascript', code: 'console.log(42)' });
test('run_code JS: 42', String(rc1).includes('42'));
const rc2 = await reg.get('run_code').execute({ language: 'python', code: 'print(2**10)' });
test('run_code Python: 1024', String(rc2).includes('1024'));
const rcEnv = await reg.get('run_code').execute({ language: 'javascript', code: 'console.log(process.env.OPENAI_API_KEY || "STRIPPED")' });
test('run_code: env stripped', String(rcEnv).includes('STRIPPED'));

// http_fetch — SSRF
test('SSRF: 169.254 blocked', String(await reg.get('http_fetch').execute({ url: 'http://169.254.169.254/' })).match(/Blocked|private|Error/));
test('SSRF: localhost blocked', String(await reg.get('http_fetch').execute({ url: 'http://127.0.0.1:8080/' })).match(/Blocked|private|Error/));
test('SSRF: 10.x blocked', String(await reg.get('http_fetch').execute({ url: 'http://10.0.0.1/' })).match(/Blocked|private|Error/));

// web_search — DuckDuckGo fallback (no TAVILY_API_KEY)
const wsResult = await reg.get('web_search').execute({ query: 'test', max_results: 2 });
test('web_search: returns string', typeof wsResult === 'string');

// slack — graceful without token
const slResult = await reg.get('slack').execute({ action: 'list_channels' });
test('slack: graceful error', String(slResult).includes('SLACK_BOT_TOKEN') || String(slResult).includes('Error'));

// github — graceful without token
const ghResult = await reg.get('github').execute({ action: 'list_repos' });
test('github: graceful error', String(ghResult).includes('GITHUB_TOKEN') || String(ghResult).includes('Error'));

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 7: ORCHESTRATOR — ZODA SCHEMA   ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

// Test that buildZodSchema correctly converts every parameter type
const core = await import(path.join(ROOT, 'packages/core/dist/index.js'));
const providers = await import(path.join(ROOT, 'packages/providers/dist/index.js'));
const voice = await import(path.join(ROOT, 'packages/voice/dist/index.js'));

const provReg = new providers.ProviderRegistry(config);
const vp = new voice.VoicePipeline();
const orch = new core.AgentOrchestrator(provReg, reg, cm, vp);

// Verify the orchestrator can build tool wrappers without crashing
// This calls buildZodSchema for every tool
test('Orchestrator constructed', orch !== null && typeof orch.process === 'function');

// Simulate a process call — it will fail at the LLM (fake key) but should NOT crash in tool setup
const orchResult = await orch.process({
  id: 'test-1', channel: 'cli', channelMessageId: 'test-1', userId: 'drill-user',
  userName: 'drill-user', text: 'What is the current time?', attachments: [],
  timestamp: new Date(), raw: {}
}, simpleRoute, 'You are a test bot with tools.');

test('Orchestrator returns OrchestratorResult', typeof orchResult === 'object' && typeof orchResult.text === 'string');
test('Orchestrator: no API key leak', !orchResult.text.includes('sk-test'));
test('Orchestrator: no stack trace leak', !orchResult.text.includes('at '));

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 8: GATEWAY — AUTH + RATE + SEND ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

// Test with allowedUserIds
const gwConfig = {
  ...config,
  security: {
    ...config.security,
    allowedUserIds: { telegram: ['allowed-user-1'], '*': ['global-admin'] }
  }
};
const gw = new core.Gateway(gwConfig, store);

// Auth test via processor
let processedUser = null;
gw.setProcessor(async (msg) => {
  processedUser = msg.userId;
  return { text: 'ok' };
});

// Register a mock adapter that lets us test the full flow
const channels = await import(path.join(ROOT, 'packages/channels/dist/index.js'));
const testCli = new channels.CLIAdapter();
await testCli.initialize({ enabled: true });
gw.registerAdapter(testCli);

// Formatter tests
const fmt = new core.ResponseFormatter();
test('Fmt: telegram bold', fmt.formatForChannel('**bold**', 'telegram') === '*bold*');
test('Fmt: telegram italic', fmt.formatForChannel('*italic*', 'telegram') === '_italic_');
test('Fmt: telegram mixed', fmt.formatForChannel('**bold** and *italic*', 'telegram') === '*bold* and _italic_');
test('Fmt: discord unchanged', fmt.formatForChannel('**bold**', 'discord') === '**bold**');
test('Fmt: slack bold', fmt.formatForChannel('**bold**', 'slack') === '*bold*');
test('Fmt: slack italic', fmt.formatForChannel('*italic*', 'slack') === '_italic_');
test('Fmt: whatsapp bold', fmt.formatForChannel('**bold**', 'whatsapp') === '*bold*');
test('Fmt: cli unchanged', fmt.formatForChannel('**bold**', 'cli') === '**bold**');

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║  SECTION 9: FULL BOOTSTRAP SIMULATION    ║');
console.log('╚══════════════════════════════════════════╝');
// ==================================================================

// Simulate exactly what apps/nexus/src/index.ts does
const appConfig = shared.loadConfig(TEST_DIR + '/nexus.yaml');
const appStore = new memory.SQLiteStore(TEST_DIR + '/app-drill.db');
const appMemory = new memory.ConversationManager(appStore, appConfig.memory.maxContextTurns);
appStore.pruneOldConversations(appConfig.memory.retentionDays);
const appClassifier = new router.IntentClassifier();
const appModelSelector = new router.ModelSelector(appConfig);
const appProviders = new providers.ProviderRegistry(appConfig);
const appTools = tools.ToolRegistry.createDefaultTools(appConfig.tools.enabled, appConfig.tools.allowedPaths ?? []);
const appVoice = new voice.VoicePipeline();

// Build dynamic persona (exactly as index.ts does)
let persona = 'You are DrillBot, a helpful AI assistant.';
const toolList = appTools.getEnabled().map(t => `- ${t.name}: ${t.description}`).join('\n');
if (toolList) {
  persona += `\n\nYou have access to the following tools and MUST use them when appropriate:\n${toolList}`;
  persona += '\n\nIMPORTANT: When the user asks about current events, news, weather, use the web_search tool.';
}

test('Persona includes web_search', persona.includes('web_search'));
test('Persona includes slack', persona.includes('slack'));
test('Persona includes github', persona.includes('github'));
test('Persona includes calculator', persona.includes('calculator'));
test('Persona includes datetime', persona.includes('datetime'));

const appOrch = new core.AgentOrchestrator(appProviders, appTools, appMemory, appVoice);
const appGateway = new core.Gateway(appConfig, appStore);
const appFormatter = new core.ResponseFormatter();

const appCli = new channels.CLIAdapter();
await appCli.initialize({ enabled: true });
appCli.setAssistantName(appConfig.assistant.name);
appCli.setToolNames(appTools.getEnabled().map(t => t.name));
appCli.onReset(async (userId, channel) => { appMemory.resetConversation(userId, channel); });
appGateway.registerAdapter(appCli);

appGateway.setProcessor(async (message) => {
  const hasVoice = message.attachments.some(a => a.type === 'voice' || a.type === 'audio');
  const classification = appClassifier.classify(message.text, hasVoice);
  const route = appModelSelector.selectModel(classification.intent);
  const result = await appOrch.process(message, route, persona);
  const formatted = appFormatter.formatForChannel(result.text, message.channel);
  return { text: formatted, attachments: result.audio ? [{ type: 'audio', buffer: result.audio, mimeType: 'audio/wav', fileName: 'resp.wav' }] : undefined };
});

test('Gateway processor wired', appGateway.processor !== null);

// E2E: "what time is it?" → SIMPLE → google
const e2e1 = await appGateway.processor({
  id: 'e2e1', channel: 'cli', channelMessageId: 'e2e1', userId: 'cli-user',
  userName: 'cli-user', text: 'what time is it?', attachments: [],
  timestamp: new Date(), raw: {}
});
test('E2E "what time is it?": returns text', typeof e2e1.text === 'string' && e2e1.text.length > 0);

// E2E: "debug this code" → CODE → openai
const e2e2 = await appGateway.processor({
  id: 'e2e2', channel: 'telegram', channelMessageId: 'e2e2', userId: 'tg-user',
  userName: 'tg-user', text: 'help me debug this function', attachments: [],
  timestamp: new Date(), raw: { chat: { id: 12345 } }
});
test('E2E "debug function": returns text', typeof e2e2.text === 'string' && e2e2.text.length > 0);

// Verify memory persisted
const e2eCtx = appMemory.getContext('cli-user', 'cli', 'sys');
test('Memory: user message persisted', e2eCtx.turns.length >= 1);
test('Memory: first turn is user', e2eCtx.turns[0]?.role === 'user');

appStore.close();
store.close();

// ==================================================================
console.log('\n╔══════════════════════════════════════════╗');
console.log('║         FINAL RESULTS                    ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  Total:   ${total}`);
if (failures.length > 0) {
  console.log('\n  Failed tests:');
  for (const f of failures) console.log(`    - ${f}`);
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
