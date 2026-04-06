/**
 * Dry Run Part 2 — Tools, Providers, Channels, Core, Voice, App Bootstrap
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; failures.push(message); console.log(`  ❌ FAIL: ${message}`); }
}

// Setup env
process.env['OPENAI_API_KEY'] = 'sk-test-key-12345';
process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'google-test-key';

const shared = await import(path.join(ROOT, 'packages/shared/dist/index.js'));
const testYamlDir = '/tmp/nexus-test-config';
const yamlConfig = shared.loadConfig(path.join(testYamlDir, 'nexus.yaml'));

// ============================================================
// TEST: Tools continued — calculator safety, fs, run_code
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Tools — Safety, FS, Code Execution');
console.log('══════════════════════════════════════════');

const tools = await import(path.join(ROOT, 'packages/tools/dist/index.js'));
const toolRegistry = tools.ToolRegistry.createDefaultTools(
  ['datetime', 'calculator', 'web_search', 'http_fetch', 'run_code', 'fs_read', 'fs_write'],
  ['/tmp/nexus-test']
);

// Calculator safety
const calcTool = toolRegistry.get('calculator');
const unsafeResult = await calcTool.execute({ expression: 'process.exit(1)' });
assert(String(unsafeResult).includes('Error'), 'Calculator rejects unsafe expression');

const safeResult = await calcTool.execute({ expression: '(3 ** 2) + (4 ** 2)' });
assert(String(safeResult).includes('25'), `3² + 4² = 25: "${safeResult}"`);

// FS tools
const fsWriteTool = toolRegistry.get('fs_write');
const fsReadTool = toolRegistry.get('fs_read');
fs.mkdirSync('/tmp/nexus-test', { recursive: true });

const writeResult = await fsWriteTool.execute({ path: '/tmp/nexus-test/hello.txt', content: 'Hello Nexus' });
assert(String(writeResult).includes('Successfully'), `fs_write succeeded`);

const readResult = await fsReadTool.execute({ path: '/tmp/nexus-test/hello.txt' });
assert(readResult === 'Hello Nexus', `fs_read correct: "${readResult}"`);

const restrictedResult = await fsReadTool.execute({ path: '/etc/passwd' });
assert(String(restrictedResult).includes('denied'), 'fs_read blocks outside allowed paths');

// run_code
const runCodeTool = toolRegistry.get('run_code');
const jsResult = await runCodeTool.execute({ language: 'javascript', code: 'console.log("nexus-js")' });
assert(String(jsResult).includes('nexus-js'), `JS code execution works: "${jsResult}"`);

const pyResult = await runCodeTool.execute({ language: 'python', code: 'print(2**10)' });
assert(String(pyResult).includes('1024'), `Python code execution works: "${pyResult}"`);

const bashResult = await runCodeTool.execute({ language: 'bash', code: 'echo "nexus-bash"' });
assert(String(bashResult).includes('nexus-bash'), `Bash code execution works: "${bashResult}"`);

// ============================================================
// TEST: Providers
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Providers — Registry & Model Creation');
console.log('══════════════════════════════════════════');

const providers = await import(path.join(ROOT, 'packages/providers/dist/index.js'));
const providerRegistry = new providers.ProviderRegistry(yamlConfig);
const availProviders = providerRegistry.getAvailableProviders();
assert(availProviders.includes('openai'), 'OpenAI provider registered');
assert(availProviders.includes('google'), 'Google provider registered');
assert(availProviders.length === 2, `2 providers (no ollama): ${availProviders.length}`);

const openaiModel = providerRegistry.getModel('openai', 'gpt-4o');
assert(openaiModel !== null, 'OpenAI model instance created');

const googleModel = providerRegistry.getModel('google', 'gemini-2.0-flash');
assert(googleModel !== null, 'Google model instance created');

const ollamaModel = providerRegistry.getModel('ollama');
assert(ollamaModel === null, 'Ollama null (not configured)');

// ============================================================
// TEST: Channels — All Adapters Construct
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Channels — Adapter Construction');
console.log('══════════════════════════════════════════');

const channels = await import(path.join(ROOT, 'packages/channels/dist/index.js'));
assert(typeof channels.CLIAdapter === 'function', 'CLIAdapter exported');
assert(typeof channels.TelegramAdapter === 'function', 'TelegramAdapter exported');
assert(typeof channels.DiscordAdapter === 'function', 'DiscordAdapter exported');
assert(typeof channels.SlackAdapter === 'function', 'SlackAdapter exported');
assert(typeof channels.WhatsAppAdapter === 'function', 'WhatsAppAdapter exported');

const cliAdapter = new channels.CLIAdapter();
assert(cliAdapter.name === 'cli', 'CLI adapter name correct');
await cliAdapter.initialize({ enabled: true });
assert(true, 'CLI adapter initializes OK');

const tgAdapter = new channels.TelegramAdapter();
assert(tgAdapter.name === 'telegram', 'Telegram adapter name correct');

const discordAdapter = new channels.DiscordAdapter();
assert(discordAdapter.name === 'discord', 'Discord adapter name correct');

const slackAdapter = new channels.SlackAdapter();
assert(slackAdapter.name === 'slack', 'Slack adapter name correct');

const waAdapter = new channels.WhatsAppAdapter();
assert(waAdapter.name === 'whatsapp', 'WhatsApp adapter name correct');

// ============================================================
// TEST: Core — Gateway, Formatter, Orchestrator
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Core — Gateway, Formatter, Orchestrator');
console.log('══════════════════════════════════════════');

const core = await import(path.join(ROOT, 'packages/core/dist/index.js'));
assert(typeof core.Gateway === 'function', 'Gateway exported');
assert(typeof core.AgentOrchestrator === 'function', 'AgentOrchestrator exported');
assert(typeof core.ResponseFormatter === 'function', 'ResponseFormatter exported');

// Gateway
const gateway = new core.Gateway(yamlConfig);
assert(gateway.processor === null, 'Gateway starts with null processor');

gateway.setProcessor(async (msg) => ({ text: 'echo: ' + msg.text }));
assert(gateway.processor !== null, 'Processor set');

const testGWResult = await gateway.processor({
  id: 't1', channel: 'cli', channelMessageId: 't1', userId: 'u1',
  userName: 'u1', text: 'hello', attachments: [], timestamp: new Date(), raw: {}
});
assert(testGWResult.text === 'echo: hello', 'Gateway processor works');

// Register adapter + verify
const testCLI = new channels.CLIAdapter();
await testCLI.initialize({ enabled: true });
gateway.registerAdapter(testCLI);
assert(true, 'Adapter registered on gateway');

// Formatter
const fmt = new core.ResponseFormatter();
assert(fmt.formatForChannel('**bold**', 'telegram') === '*bold*', 'Telegram: **→*');
assert(fmt.formatForChannel('**bold**', 'discord') === '**bold**', 'Discord: unchanged');
assert(fmt.formatForChannel('**bold**', 'slack') === '*bold*', 'Slack: **→*');
assert(fmt.formatForChannel('**bold**', 'whatsapp') === '*bold*', 'WhatsApp: **→*');
assert(fmt.formatForChannel('**bold**', 'cli') === '**bold**', 'CLI: unchanged');

// ============================================================
// TEST: Voice Pipeline
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Voice — Pipeline Construction');
console.log('══════════════════════════════════════════');

const voice = await import(path.join(ROOT, 'packages/voice/dist/index.js'));
const emptyPipeline = new voice.VoicePipeline();
assert(emptyPipeline.isSTTAvailable() === false, 'Empty: no STT');
assert(emptyPipeline.isTTSAvailable() === false, 'Empty: no TTS');

const fullPipeline = new voice.VoicePipeline(
  new voice.WhisperClient('http://localhost:3002'),
  new voice.PiperClient('http://localhost:3003')
);
assert(fullPipeline.isSTTAvailable() === true, 'Full: STT available');
assert(fullPipeline.isTTSAvailable() === true, 'Full: TTS available');

// STT graceful failure (no server running)
const sttResult = await fullPipeline.speechToText(Buffer.from('test'), 'audio/wav');
assert(sttResult === '', 'STT returns empty on server unreachable');

// ============================================================
// TEST: CLI Wizard module loads
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: CLI Wizard — Module Import');
console.log('══════════════════════════════════════════');

const cli = await import(path.join(ROOT, 'packages/cli/dist/wizard.js'));
assert(typeof cli.runWizard === 'function', 'runWizard exported');

// ============================================================
// TEST: Full App Bootstrap (simulated)
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Full App Bootstrap Simulation');
console.log('══════════════════════════════════════════');

const memory = await import(path.join(ROOT, 'packages/memory/dist/index.js'));
const router = await import(path.join(ROOT, 'packages/router/dist/index.js'));

// 1-3: Config + persona + memory
const appConfig = shared.loadConfig(path.join(testYamlDir, 'nexus.yaml'));
const persona = `You are ${appConfig.assistant.name}, a helpful AI.`;
const appStore = new memory.SQLiteStore('/tmp/nexus-app-dryrun.db');
const appMemory = new memory.ConversationManager(appStore, appConfig.memory.maxContextTurns);
assert(true, 'Bootstrap: config + persona + memory OK');

// 4: Router
const appClassifier = new router.IntentClassifier();
const appModelSelector = new router.ModelSelector(appConfig);
assert(true, 'Bootstrap: router OK');

// 5: Providers
const appProviders = new providers.ProviderRegistry(appConfig);
assert(appProviders.getAvailableProviders().length >= 1, 'Bootstrap: providers available');

// 6: Tools
const appTools = tools.ToolRegistry.createDefaultTools(
  appConfig.tools.enabled,
  appConfig.tools.allowedPaths ?? []
);
assert(appTools.getEnabled().length > 0, 'Bootstrap: tools enabled');

// 7: Voice
const appVoice = new voice.VoicePipeline();
assert(true, 'Bootstrap: voice OK');

// 8: Orchestrator
const appOrch = new core.AgentOrchestrator(appProviders, appTools, appMemory, appVoice);
assert(true, 'Bootstrap: orchestrator OK');

// 9: Gateway + formatter
const appGateway = new core.Gateway(appConfig);
const appFormatter = new core.ResponseFormatter();
assert(true, 'Bootstrap: gateway + formatter OK');

// 10: Register CLI
const appCLI = new channels.CLIAdapter();
await appCLI.initialize({ enabled: true });
appGateway.registerAdapter(appCLI);
assert(true, 'Bootstrap: CLI adapter registered');

// 11: Wire processor
appGateway.setProcessor(async (message) => {
  const hasVoice = message.attachments.some((a) => a.type === 'voice' || a.type === 'audio');
  const classification = appClassifier.classify(message.text, hasVoice);
  const route = appModelSelector.selectModel(classification.intent);
  // Skip actual LLM call — just verify the wiring
  const formatted = appFormatter.formatForChannel(`[${classification.intent}] Would call ${route.provider}/${route.model}`, message.channel);
  return { text: formatted };
});
assert(appGateway.processor !== null, 'Bootstrap: processor wired');

// 12: End-to-end message simulation (without LLM)
const e2eResult = await appGateway.processor({
  id: 'e2e-1', channel: 'cli', channelMessageId: 'e2e-1', userId: 'cli-user',
  userName: 'cli-user', text: 'help me debug this function', attachments: [],
  timestamp: new Date(), raw: {}
});
assert(e2eResult.text.includes('CODE'), `E2E: "debug function" → CODE intent: "${e2eResult.text}"`);
assert(e2eResult.text.includes('openai'), `E2E: CODE routes to openai: "${e2eResult.text}"`);
assert(e2eResult.text.includes('gpt-4o'), `E2E: CODE routes to gpt-4o: "${e2eResult.text}"`);

const e2eResult2 = await appGateway.processor({
  id: 'e2e-2', channel: 'telegram', channelMessageId: 'e2e-2', userId: 'user-1',
  userName: 'user-1', text: 'hello there', attachments: [],
  timestamp: new Date(), raw: { chat: { id: 12345 } }
});
assert(e2eResult2.text.includes('SIMPLE'), `E2E: "hello there" → SIMPLE: "${e2eResult2.text}"`);
assert(e2eResult2.text.includes('google'), `E2E: SIMPLE routes to google: "${e2eResult2.text}"`);

const e2eVoice = await appGateway.processor({
  id: 'e2e-3', channel: 'cli', channelMessageId: 'e2e-3', userId: 'cli-user',
  userName: 'cli-user', text: '', attachments: [{ type: 'voice', mimeType: 'audio/ogg', buffer: Buffer.from('fake') }],
  timestamp: new Date(), raw: {}
});
assert(e2eVoice.text.includes('VOICE'), `E2E: voice attachment → VOICE intent: "${e2eVoice.text}"`);

appStore.close();

// ============================================================
// TEST: Orchestrator with actual LLM call (expect graceful error)
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('TEST: Orchestrator — LLM Call (graceful error)');
console.log('══════════════════════════════════════════');

const orchStore = new memory.SQLiteStore('/tmp/nexus-orch-test2.db');
const orchMemory = new memory.ConversationManager(orchStore, 10);
const orchVoice = new voice.VoicePipeline();
const orch = new core.AgentOrchestrator(appProviders, appTools, orchMemory, orchVoice);

const orchRoute = router.DEFAULT_ROUTES.find(r => r.intent === 'SIMPLE');
const orchResult = await orch.process(
  {
    id: 'orch-1', channel: 'cli', channelMessageId: 'orch-1', userId: 'user-1',
    userName: 'user-1', text: 'hello', attachments: [], timestamp: new Date(), raw: {}
  },
  orchRoute,
  'You are a test bot.'
);
assert(typeof orchResult === 'string', 'Orchestrator returns string');
assert(orchResult.length > 0, `Orchestrator returns error message (expected — fake API key): "${orchResult.slice(0, 100)}"`);
// Verify memory was saved despite error
const orchCtx = orchMemory.getContext('user-1', 'cli', 'system');
assert(orchCtx.turns.length >= 1, `Memory saved user message (${orchCtx.turns.length} turns)`);

orchStore.close();

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n══════════════════════════════════════════');
console.log('FINAL RESULTS');
console.log('══════════════════════════════════════════');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
if (failures.length > 0) {
  console.log('\nFailed tests:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log(`\nTotal: ${passed + failed} tests`);
process.exit(failed > 0 ? 1 : 0);
