/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals = {}, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, URL, Response, AbortSignal, process: { env: { ASSEMBLYAI_API_KEY: 'secret-key' } }, ...globals, require(name) {
    if (name in dependencies) return dependencies[name];
    if (name === '@/lib/assemblyai/voices' || name === './voices' || name === '../../../lib/assemblyai/voices') return load('lib/assemblyai/voices.ts');
    if (name === '@/lib/assemblyai/token') return load('lib/assemblyai/token.ts', globals);
    if (name === './blueprint') return load('lib/assembler/blueprint.ts');
    throw new Error(`Unexpected import ${name}`);
  } });
  return exports;
}
const voices = load('lib/assemblyai/voices.ts');
test('catalog contains all 16 unique supported voices and legacy defaults', () => {
  assert.equal(voices.ASSEMBLYAI_VOICES.length, 16);
  assert.equal(new Set(voices.ASSEMBLYAI_VOICES.map(v => v.id)).size, 16);
  for (const voice of voices.ASSEMBLYAI_VOICES) assert.equal(voices.requireVoiceId(voice.id), voice.id);
  assert.throws(() => voices.requireVoiceId('invalid'));
  assert.equal(voices.savedVoiceId({}), 'alba');
  assert.equal(voices.savedVoiceId({ voice_id: 'eve', blueprint: { voice_id: 'george' } }), 'eve');
});
test('prompt selection handles female, male, UK and explicit voices without owner-name matches', () => {
  for (const [prompt, expected] of [['a female assistant', 'alba'], ['a male assistant', 'michael'], ['a British woman assistant', 'anna'], ['a UK male assistant', 'charles'], ['female assistant with voice george', 'george'], ['use Eve voice', 'eve'], ['voice_id: vera', 'vera'], ['business owner Anna', 'alba']]) assert.equal(voices.selectPromptVoice(prompt), expected);
});
test('compiler carries selected voice and validator accepts legacy but rejects unsupported IDs', () => {
  const compiler = load('lib/assembler/compiler.ts');
  const validator = load('lib/assembler/blueprint.ts');
  for (const [intent, expected] of [['Create a female receptionist to capture requests', 'alba'], ['Create a male receptionist to capture requests', 'michael'], ['Create a receptionist using voice jean for calls', 'jean']]) {
    const blueprint = compiler.assembleAgentBlueprint(intent);
    assert.equal(blueprint.voice_id, expected);
    delete blueprint.voice_id;
    assert.doesNotThrow(() => validator.validateAgentBlueprint(blueprint));
    assert.throws(() => validator.validateAgentBlueprint({ ...blueprint, voice_id: 'unknown' }));
  }
});
test('AssemblyAI create and update payloads use selected voices and default alba', async () => {
  const payloads = [];
  const client = load('lib/assemblyai/client.ts', { fetch: async (_url, options) => { payloads.push(JSON.parse(options.body)); return Response.json({ id: 'agent' }); } });
  const base = { name: 'Assistant', businessName: 'Shop' };
  await client.createAssemblyAIAgent({ ...base, voiceId: 'michael' });
  await client.updateAssemblyAIAgent('agent', { ...base, voiceId: 'eve' });
  await client.createAssemblyAIAgent(base);
  const blueprint = load('lib/assembler/compiler.ts').assembleAgentBlueprint('Create a receptionist with voice charles for bookings');
  await client.createAssemblyAIAgent({ ...base, blueprint });
  await client.updateAssemblyAIAgent('agent', { ...base, blueprint, voiceId: 'vera' });
  assert.deepEqual(payloads.map(p => p.voice.voice_id), ['michael', 'eve', 'alba', 'charles', 'vera']);
});
test('preview validates before minting and returns only safe fixed session config', async () => {
  const calls = [];
  const route = load('app/api/voice-preview/route.ts', { fetch: async (url) => { calls.push([Number(url.searchParams.get('expires_in_seconds')), Number(url.searchParams.get('max_session_duration_seconds'))]); return Response.json({ token: 'temporary' }); } });
  assert.equal((await route.POST({ json: async () => ({ voice_id: 'invalid' }) })).status, 400);
  assert.equal(calls.length, 0);
  const response = await route.POST({ json: async () => ({ voice_id: 'lola', system_prompt: 'ignored', tools: ['ignored'] }) });
  const data = await response.json();
  assert.deepEqual(calls, [[60, 60]]);
  assert.equal(data.session.output.voice, 'lola');
  assert.deepEqual(data.session.tools, []);
  assert.equal(data.session.output.format.encoding, 'audio/pcm');
  assert.doesNotMatch(JSON.stringify(data), /secret-key|ignored/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('shared token transport keeps credentials server-side and supports short lifetimes', async () => {
  let request;
  const token = load('lib/assemblyai/token.ts', { fetch: async (url, options) => { request = { url, options }; return Response.json({ token: 'temporary' }); } });
  const result = await token.mintVoiceToken(60, 60);
  assert.equal(request.url.searchParams.get('expires_in_seconds'), '60');
  assert.equal(request.url.searchParams.get('max_session_duration_seconds'), '60');
  assert.equal(request.options.headers.Authorization, 'Bearer secret-key');
  assert.equal(result.token, 'temporary');
  assert.doesNotMatch(JSON.stringify(result), /secret-key/);
});
