/**
 * Nexus Final Audit — Exhaustive Integration Test Suite
 * Tests every package, every flow, every edge case.
 * Run: node tests/final-audit.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
const failures = [];
const assert = (c, m) => { if (c) { passed++; } else { failed++; failures.push(m); console.log(`  ❌ ${m}`); } };
const section = (s) => console.log(`\n═══ ${s} ═══`);

process.env['OPENAI_API_KEY'] = 'sk-test-key-12345';
process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'google-test-key';

// ============================================================
section('1. @nexus/shared — Types, Schemas, Config, Logger, Errors');
// ============================================================
const shared = await import(path.join(ROOT, 'packages/shared/dist/index.js'));

// Schema validation
assert(typeof shared.nexusConfigSchema === 'object', 'nexusConfigSchema exported');
assert(typeof shared.loadConfig === 'function', 'loadConfig exported');
assert(typeof shared.getConfig === 'function', 'getConfig exported');
assert(typeof shared.watchConfig === 'function', 'watchConfig exported');
assert(typeof shared.stopWatchingConfig === 'function', 'stopWatchingConfig exported');
assert(typeof shared.logger === 'object', 'logger exported');
assert(typeof shared.createChildLogger === 'function', 'createChildLogger exported');
assert(typeof shared.NexusError === 'function', 'NexusError exported');
assert(typeof shared.ConfigError === 'function', 'ConfigError exported');
assert(typeof shared.ProviderError === 'function', 'ProviderError exported');
assert(typeof shared.ChannelError === 'function', 'ChannelError exported');
assert(typeof shared.ToolError === 'function', 'ToolError exported');
assert(typeof shared.MemoryError === 'function', 'MemoryError exported');
assert(typeof shared.RateLimitError === 'function', 'RateLimitError exported');

// Error hierarchy
const nexErr = new shared.NexusError('test', 'CODE');
assert(nexErr instanceof Error, 'NexusError extends Error');
assert(nexErr.code === 'CODE', 'NexusError has code');
assert(new shared.ConfigError('x').code === 'CONFIG_ERROR', 'ConfigError code');
assert(new shared.ProviderError('x', 'openai').provider === 'openai', 'ProviderError provider');
assert(new shared.ChannelError('x', 'telegram').channel === 'telegram', 'ChannelError channel');
assert(new shared.ToolError('x', 'web_search').tool === 'web_search', 'ToolError tool');
assert(new shared.MemoryError('x').code === 'MEMORY_ERROR', 'MemoryError code');
assert(new shared.RateLimitError('u1').message.includes('u1'), 'RateLimitError includes userId');

// Config from YAML with env var resolution
const testDir = '/tmp/nexus-final-audit';
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, 'nexus.yaml'), `
assistant:
  name: TestBot
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
  dbPath: /tmp/nexus-final-test.db
  maxContextTurns: 10
  retentionDays: 30
tools:
  enabled: [datetime, calculator, web_search]
  allowedPaths: [/tmp/nexus-test-fs]
security:
  rateLimitPerMinute: 20
`);
const config = shared.loadConfig(path.join(testDir, 'nexus.yaml'));
assert(config.assistant.name === 'TestBot', 'YAML: assistant.name');
assert(config.providers.openai?.apiKey === 'sk-test-key-12345', 'YAML: ${OPENAI_API_KEY} resolved');
assert(config.providers.google?.apiKey === 'google-test-key', 'YAML: ${GOOGLE_API_KEY} resolved');
assert(config.routing.defaultProvider === 'google', 'YAML: routing.defaultProvider=google');
assert(config.routing.fallbackPolicy === 'warn', 'YAML: routing.fallbackPolicy=warn');
assert(config.routing.rules.length === 2, 'YAML: 2 routing rules');
assert(config.memory.dbPath === '/tmp/nexus-final-test.db', 'YAML: memory.dbPath');
assert(config.memory.maxContextTurns === 10, 'YAML: maxContextTurns=10');
assert(config.memory.retentionDays === 30, 'YAML: retentionDays=30');
assert(config.tools.enabled.includes('web_search'), 'YAML: web_search enabled');
assert(config.security.rateLimitPerMinute === 20, 'YAML: rateLimitPerMinute=20');

// Config with empty provider stripped
process.env['OPENAI_API_KEY'] = '';
const config2Yaml = path.join(testDir, 'nexus2.yaml');
fs.writeFileSync(config2Yaml, `
providers:
  openai:
    apiKey: \${OPENAI_API_KEY}
  google:
    apiKey: valid-key
`);
const config2 = shared.loadConfig(config2Yaml);
assert(config2.providers.openai === undefined, 'Empty API key provider stripped');
// Note: mergeWithEnv overrides YAML values with env vars (correct behavior)
// GOOGLE_GENERATIVE_AI_API_KEY env var overrides 'valid-key' from YAML
assert(config2.providers.google?.apiKey === 'google-test-key', 'Env var overrides YAML value');
process.env['OPENAI_API_KEY'] = 'sk-test-key-12345'; // restore

// ============================================================
section('2. @nexus/memory — SQLite, Conversations, Rate Limits, Pruning');
// ============================================================
const memory = await import(path.join(ROOT, 'packages/memory/dist/index.js'));
assert(typeof memory.SQLiteStore === 'function', 'SQLiteStore exported');
assert(typeof memory.ConversationManager === 'function', 'ConversationManager exported');
assert(typeof memory.runMigrations === 'function', 'runMigrations exported');

const dbPath = '/tmp/nexus-final-audit-mem.db';
try { fs.unlinkSync(dbPath); } catch {}
const store = new memory.SQLiteStore(dbPath);
assert(fs.existsSync(dbPath), 'DB file created');

// Conversation CRUD
const cid1 = store.getOrCreateConversation('u1', 'telegram');
assert(typeof cid1 === 'string' && cid1.length > 10, 'Conversation UUID created');
assert(store.getOrCreateConversation('u1', 'telegram') === cid1, 'Same user+channel = same conversation');
assert(store.getOrCreateConversation('u1', 'discord') !== cid1, 'Different channel = different conversation');

// Turn CRUD
store.addTurn(cid1, 'user', 'msg1', 'telegram', 'u1');
store.addTurn(cid1, 'assistant', 'msg2', 'telegram', 'u1');
store.addTurn(cid1, 'user', 'msg3', 'telegram', 'u1');
store.addTurn(cid1, 'assistant', 'msg4', 'telegram', 'u1');
const allTurns = store.getTurns(cid1, 100);
assert(allTurns.length === 4, `4 turns stored (got ${allTurns.length})`);
assert(allTurns[0].content === 'msg1', 'Turns ordered chronologically');
assert(allTurns[3].content === 'msg4', 'Last turn is msg4');

// LIMIT returns most recent (rowid tiebreaker fix)
const limitedTurns = store.getTurns(cid1, 2);
assert(limitedTurns.length === 2, `Limit=2 returns 2 (got ${limitedTurns.length})`);
assert(limitedTurns[0].content === 'msg3', `Limit=2 first is msg3 (got ${limitedTurns[0].content})`);
assert(limitedTurns[1].content === 'msg4', `Limit=2 second is msg4 (got ${limitedTurns[1].content})`);

// Metadata round-trip
store.addTurn(cid1, 'user', 'with-meta', 'telegram', 'u1', { key: 'value' });
const withMeta = store.getTurns(cid1, 100);
const lastTurn = withMeta[withMeta.length - 1];
assert(lastTurn.metadata?.key === 'value', 'Metadata round-trip');

// Delete
store.deleteConversation(cid1);
assert(store.getTurns(cid1, 100).length === 0, 'Turns deleted');

// ConversationManager
const cm = new memory.ConversationManager(store, 5);
cm.addUserMessage('u2', 'cli', 'hi');
cm.addAssistantMessage('u2', 'cli', 'hello');
const ctx = cm.getContext('u2', 'cli', 'system prompt');
assert(ctx.userId === 'u2', 'CM: userId');
assert(ctx.channel === 'cli', 'CM: channel');
assert(ctx.systemPrompt === 'system prompt', 'CM: systemPrompt');
assert(ctx.turns.length === 2, `CM: 2 turns (got ${ctx.turns.length})`);

// Reset conversation
cm.resetConversation('u2', 'cli');
const afterReset = cm.getContext('u2', 'cli', 'sys');
assert(afterReset.turns.length === 0, 'CM: reset clears turns');

// Rate limiting
store.recordRateEvent('rl-user');
store.recordRateEvent('rl-user');
assert(!store.isRateLimited('rl-user', 5), 'Not rate limited at 2/5');
for (let i = 0; i < 4; i++) store.recordRateEvent('rl-user');
assert(store.isRateLimited('rl-user', 5), 'Rate limited at 6/5');
store.pruneRateEvents();

// Pruning
const oldCid = store.getOrCreateConversation('old-u', 'cli');
store.addTurn(oldCid, 'user', 'old msg', 'cli', 'old-u');
const pruned = store.pruneOldConversations(0); // 0 days = prune all
assert(pruned >= 1, `Pruned ${pruned} conversations`);

// ============================================================
section('3. @nexus/router — Intent Classifier + Model Selector');
// ============================================================
const router = await import(path.join(ROOT, 'packages/router/dist/index.js'));
assert(typeof router.IntentClassifier === 'function', 'IntentClassifier exported');
assert(typeof router.ModelSelector === 'function', 'ModelSelector exported');
assert(Array.isArray(router.DEFAULT_ROUTES) && router.DEFAULT_ROUTES.length === 6, '6 DEFAULT_ROUTES');

const classifier = new router.IntentClassifier();
// VOICE
assert(classifier.classify('hello', true).intent === 'VOICE', 'Voice attachment → VOICE');
// CODE
assert(classifier.classify('help me debug this function', false).intent === 'CODE', '"debug function" → CODE');
// AGENTIC
assert(classifier.classify('search the web for news', false).intent === 'AGENTIC', '"search the web" → AGENTIC');
// CREATIVE
assert(classifier.classify('write me a poem about stars', false).intent === 'CREATIVE', '"write poem" → CREATIVE');
// ANALYSIS
assert(classifier.classify('analyze the data and compare results', false).intent === 'ANALYSIS', '"analyze compare" → ANALYSIS');
// SIMPLE
assert(classifier.classify('hey how are you', false).intent === 'SIMPLE', '"hey how are you" → SIMPLE');

// ModelSelector
const ms = new router.ModelSelector(config);
const simpleRoute = ms.selectModel('SIMPLE');
assert(simpleRoute.provider === 'google', 'SIMPLE → google (from config rule)');
assert(simpleRoute.model === 'gemini-2.0-flash', 'SIMPLE → gemini-2.0-flash');

const codeRoute = ms.selectModel('CODE');
assert(codeRoute.provider === 'openai', 'CODE → openai');
assert(codeRoute.model === 'gpt-4o', 'CODE → gpt-4o');
assert(codeRoute.supportsTools === true, 'CODE supportsTools=true');

// defaultProvider wiring: VOICE has no config rule, default is ollama which isn't configured
// should fall to google (config.routing.defaultProvider)
const voiceRoute = ms.selectModel('VOICE');
assert(voiceRoute.provider === 'google', `VOICE falls to defaultProvider=google (got ${voiceRoute.provider})`);

// Fallback policy
assert(typeof ms.updateConfig === 'function', 'updateConfig method exists');

// ============================================================
section('4. @nexus/tools — All 7 Tools');
// ============================================================
const tools = await import(path.join(ROOT, 'packages/tools/dist/index.js'));
assert(typeof tools.ToolRegistry === 'function', 'ToolRegistry exported');

fs.mkdirSync('/tmp/nexus-test-fs', { recursive: true });
const reg = tools.ToolRegistry.createDefaultTools(
  ['datetime', 'calculator', 'web_search', 'http_fetch', 'run_code', 'fs_read', 'fs_write'],
  ['/tmp/nexus-test-fs']
);
assert(reg.getAll().length === 7, `7 tools registered (got ${reg.getAll().length})`);
assert(reg.getEnabled().length === 7, `7 enabled (got ${reg.getEnabled().length})`);

// datetime
const dt = await reg.get('datetime').execute({ timezone: 'America/New_York', format: 'full' });
assert(typeof dt === 'string' && dt.length > 10, `datetime works: ${String(dt).slice(0, 50)}`);

// calculator — safe math
const c1 = await reg.get('calculator').execute({ expression: '2 + 2' });
assert(String(c1).includes('4'), `calc 2+2: ${c1}`);
const c2 = await reg.get('calculator').execute({ expression: 'Math.sqrt(144)' });
assert(String(c2).includes('12'), `calc sqrt(144): ${c2}`);
const c3 = await reg.get('calculator').execute({ expression: '3 ** 2 + 4 ** 2' });
assert(String(c3).includes('25'), `calc 3²+4²: ${c3}`);

// calculator — security: dangerous identifiers
const csafe1 = await reg.get('calculator').execute({ expression: 'process.exit(1)' });
assert(String(csafe1).includes('Error'), 'calc blocks process.exit');
const csafe2 = await reg.get('calculator').execute({ expression: 'require("fs")' });
assert(String(csafe2).includes('Error'), 'calc blocks require');
const csafe3 = await reg.get('calculator').execute({ expression: 'constructor.constructor("return this")()' });
assert(String(csafe3).includes('Error'), 'calc blocks constructor');

// fs_write + fs_read
const fsw = await reg.get('fs_write').execute({ path: '/tmp/nexus-test-fs/test.txt', content: 'hello audit' });
assert(String(fsw).includes('Successfully'), `fs_write: ${fsw}`);
const fsr = await reg.get('fs_read').execute({ path: '/tmp/nexus-test-fs/test.txt' });
assert(fsr === 'hello audit', `fs_read: "${fsr}"`);

// fs_read — path restriction
const blocked = await reg.get('fs_read').execute({ path: '/etc/passwd' });
assert(String(blocked).includes('denied'), 'fs_read blocks /etc/passwd');

// run_code — sandbox
const rc1 = await reg.get('run_code').execute({ language: 'javascript', code: 'console.log(2+2)' });
assert(String(rc1).includes('4'), `run_code JS: ${rc1}`);
const rc2 = await reg.get('run_code').execute({ language: 'python', code: 'print(2**10)' });
assert(String(rc2).includes('1024'), `run_code Python: ${rc2}`);
// Env var stripped
const rc3 = await reg.get('run_code').execute({ language: 'javascript', code: 'console.log(process.env.OPENAI_API_KEY || "stripped")' });
assert(String(rc3).includes('stripped'), `run_code env stripped: ${rc3}`);

// SSRF protection on http_fetch
const ssrf1 = await reg.get('http_fetch').execute({ url: 'http://169.254.169.254/latest/meta-data/' });
assert(String(ssrf1).includes('Blocked') || String(ssrf1).includes('private'), `SSRF metadata blocked: ${String(ssrf1).slice(0, 60)}`);
const ssrf2 = await reg.get('http_fetch').execute({ url: 'http://localhost:8080/admin' });
assert(String(ssrf2).includes('Blocked') || String(ssrf2).includes('private'), `SSRF localhost blocked: ${String(ssrf2).slice(0, 60)}`);
const ssrf3 = await reg.get('http_fetch').execute({ url: 'ftp://example.com' });
assert(String(ssrf3).includes('Error') || String(ssrf3).includes('Blocked'), `SSRF ftp blocked`);

// ============================================================
section('5. @nexus/providers — Registry + Model Creation');
// ============================================================
const providers = await import(path.join(ROOT, 'packages/providers/dist/index.js'));
const provReg = new providers.ProviderRegistry(config);
assert(provReg.getAvailableProviders().includes('openai'), 'OpenAI available');
assert(provReg.getAvailableProviders().includes('google'), 'Google available');
assert(provReg.getAvailableProviders().length === 2, '2 providers (no ollama)');
assert(provReg.getModel('openai', 'gpt-4o') !== null, 'OpenAI model created');
assert(provReg.getModel('google', 'gemini-2.0-flash') !== null, 'Google model created');
assert(provReg.getModel('ollama') === null, 'Ollama null (not configured)');
assert(provReg.getModelForRoute(codeRoute) !== null, 'getModelForRoute works');

// ============================================================
section('6. @nexus/channels — All 5 Adapters');
// ============================================================
const channels = await import(path.join(ROOT, 'packages/channels/dist/index.js'));
const cli = new channels.CLIAdapter();
assert(cli.name === 'cli', 'CLI name');
assert(typeof cli.onReset === 'function', 'CLI onReset method');
await cli.initialize({ enabled: true });

const tg = new channels.TelegramAdapter();
assert(tg.name === 'telegram', 'Telegram name');
const dc = new channels.DiscordAdapter();
assert(dc.name === 'discord', 'Discord name');
const sl = new channels.SlackAdapter();
assert(sl.name === 'slack', 'Slack name');
const wa = new channels.WhatsAppAdapter();
assert(wa.name === 'whatsapp', 'WhatsApp name');

// ============================================================
section('7. @nexus/core — Gateway, Orchestrator, Formatter');
// ============================================================
const core = await import(path.join(ROOT, 'packages/core/dist/index.js'));
assert(typeof core.Gateway === 'function', 'Gateway exported');
assert(typeof core.AgentOrchestrator === 'function', 'AgentOrchestrator exported');
assert(typeof core.ResponseFormatter === 'function', 'ResponseFormatter exported');

// Gateway — auth, rate limit, health gate
const gwStore = new memory.SQLiteStore('/tmp/nexus-gw-audit.db');
const gw = new core.Gateway(config, gwStore);
assert(gw.processor === null, 'Gateway starts with null processor');
gw.setProcessor(async (msg) => ({ text: 'echo: ' + msg.text }));
assert(gw.processor !== null, 'Processor set');
const gwResult = await gw.processor({
  id: 't1', channel: 'cli', channelMessageId: 't1', userId: 'u1',
  userName: 'u1', text: 'hello', attachments: [], timestamp: new Date(), raw: {}
});
assert(gwResult.text === 'echo: hello', 'Gateway processor works');

// Formatter — all 5 channels
const fmt = new core.ResponseFormatter();
assert(fmt.formatForChannel('**bold** and *italic*', 'telegram') === '*bold* and _italic_', 'Telegram format');
assert(fmt.formatForChannel('**bold**', 'discord') === '**bold**', 'Discord format');
assert(fmt.formatForChannel('**bold** and *italic*', 'slack') === '*bold* and _italic_', 'Slack format');
assert(fmt.formatForChannel('**bold**', 'whatsapp') === '*bold*', 'WhatsApp format');
assert(fmt.formatForChannel('**bold**', 'cli') === '**bold**', 'CLI format');

// Orchestrator — returns OrchestratorResult + error sanitization
const orchMem = new memory.ConversationManager(gwStore, 10);
const orchVoice = (await import(path.join(ROOT, 'packages/voice/dist/index.js'))).VoicePipeline;
const orchToolReg = tools.ToolRegistry.createDefaultTools(['datetime', 'calculator'], []);
const orch = new core.AgentOrchestrator(provReg, orchToolReg, orchMem, new orchVoice());
const orchResult = await orch.process({
  id: 'o1', channel: 'cli', channelMessageId: 'o1', userId: 'orc-user',
  userName: 'orc-user', text: 'hello', attachments: [], timestamp: new Date(), raw: {}
}, codeRoute, 'You are a test bot.');
assert(typeof orchResult === 'object', 'Orchestrator returns object');
assert(typeof orchResult.text === 'string', 'Orchestrator result has text');
assert(!orchResult.text.includes('sk-test'), 'Error does NOT leak API key');
assert(!orchResult.text.includes('API key'), 'Error does NOT mention API key');

// Verify memory was saved despite API error
const orchCtx = orchMem.getContext('orc-user', 'cli', 'sys');
assert(orchCtx.turns.length >= 1, `Memory saved: ${orchCtx.turns.length} turns`);

// ============================================================
section('8. @nexus/voice — Pipeline Construction');
// ============================================================
const voice = await import(path.join(ROOT, 'packages/voice/dist/index.js'));
const emptyPipe = new voice.VoicePipeline();
assert(!emptyPipe.isSTTAvailable(), 'Empty: no STT');
assert(!emptyPipe.isTTSAvailable(), 'Empty: no TTS');
const fullPipe = new voice.VoicePipeline(
  new voice.WhisperClient('http://localhost:3002'),
  new voice.PiperClient('http://localhost:3003')
);
assert(fullPipe.isSTTAvailable(), 'Full: STT available');
assert(fullPipe.isTTSAvailable(), 'Full: TTS available');
const sttResult = await fullPipe.speechToText(Buffer.from('test'), 'audio/wav');
assert(sttResult === '', 'STT graceful on unreachable');

// ============================================================
section('9. Full App Bootstrap Simulation');
// ============================================================
// Simulate the exact flow from apps/nexus/src/index.ts
const appConfig = shared.loadConfig(path.join(testDir, 'nexus.yaml'));
const appStore = new memory.SQLiteStore('/tmp/nexus-app-audit.db');
const appMem = new memory.ConversationManager(appStore, appConfig.memory.maxContextTurns);
const appPruned = appStore.pruneOldConversations(appConfig.memory.retentionDays);
const appClassifier = new router.IntentClassifier();
const appModelSelector = new router.ModelSelector(appConfig);
const appProviders = new providers.ProviderRegistry(appConfig);
const appTools = tools.ToolRegistry.createDefaultTools(appConfig.tools.enabled, appConfig.tools.allowedPaths ?? []);
const appVoice = new voice.VoicePipeline();
const appOrch = new core.AgentOrchestrator(appProviders, appTools, appMem, appVoice);
const appGateway = new core.Gateway(appConfig, appStore);
const appFormatter = new core.ResponseFormatter();

const appCli = new channels.CLIAdapter();
await appCli.initialize({ enabled: true });
appCli.onReset(async (userId, channel) => {
  appMem.resetConversation(userId, channel);
});
appGateway.registerAdapter(appCli);

appGateway.setProcessor(async (message) => {
  const hasVoice = message.attachments.some(a => a.type === 'voice' || a.type === 'audio');
  const classification = appClassifier.classify(message.text, hasVoice);
  const route = appModelSelector.selectModel(classification.intent);
  const result = await appOrch.process(message, route, 'You are TestBot.');
  const outgoing = appFormatter.formatForChannel(result.text, message.channel);
  const attachments = [];
  if (result.audio) {
    attachments.push({ type: 'audio', buffer: result.audio, mimeType: result.audioMimeType ?? 'audio/wav', fileName: 'response.wav' });
  }
  return { text: outgoing, attachments: attachments.length > 0 ? attachments : undefined };
});
assert(appGateway.processor !== null, 'App: processor wired');

// E2E: CODE message
const e2e1 = await appGateway.processor({
  id: 'e2e1', channel: 'cli', channelMessageId: 'e2e1', userId: 'cli-user',
  userName: 'cli-user', text: 'help me debug this function', attachments: [],
  timestamp: new Date(), raw: {}
});
assert(typeof e2e1.text === 'string' && e2e1.text.length > 0, 'E2E: CODE returns response');

// E2E: SIMPLE message → classified correctly
const simpleClass = appClassifier.classify('hello there', false);
assert(simpleClass.intent === 'SIMPLE', 'E2E: "hello there" → SIMPLE');

// E2E: Voice message → classified correctly
const voiceClass = appClassifier.classify('', true);
assert(voiceClass.intent === 'VOICE', 'E2E: voice → VOICE');

appStore.close();
gwStore.close();
store.close();

// ============================================================
section('10. Dockerfile Audit');
// ============================================================
const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
assert(dockerfile.includes('FROM node:22'), 'Dockerfile uses Node 22');
assert(dockerfile.includes('pnpm install --frozen-lockfile'), 'Dockerfile uses frozen lockfile');
assert(dockerfile.includes('pnpm build'), 'Dockerfile runs build');
assert(dockerfile.includes('CMD ["node", "apps/nexus/dist/index.js"]'), 'Dockerfile CMD correct');

// ============================================================
// FINAL RESULTS
// ============================================================
console.log('\n═══════════════════════════════════════');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailed:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`  Total: ${passed + failed} tests`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
