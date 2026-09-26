const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, console, AbortSignal, Response, ...globals, require(name) { if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`); return dependencies[name]; } });
  return exports;
}
const blueprintModule = load('lib/assembler/blueprint.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const valid = () => ({
  version: '1', identity: { name: 'Mira', role: 'Support agent' }, objective: 'Answer support questions', greeting: 'Hello, how can I help?',
  behavior: { instructions: ['Ask before making changes'] }, knowledge: { requirements: ['Product policies'] },
  dataFields: [{ key: 'order_id', label: 'Order ID', type: 'string', description: 'The customer order reference', required: true, options: [] }],
  tools: [{ id: 'lookup_order', name: 'Look up order', description: 'Read order status', kind: 'http', operation: 'http_request', inputs: [{ key: 'order_id', type: 'string', description: 'Order reference', required: true }], expectedResult: 'Order status', connectionId: 'order_api', outcomeId: 'question_answered' }],
  connections: [{ id: 'order_api', name: 'Order API', kind: 'http', reason: 'Retrieve order status', required: true }],
  rules: [{ id: 'missing_order', description: 'Ask for an order ID', source: 'order_id', operator: 'exists', value: null, action: 'require_confirmation', target: null }],
  outcomes: [{ id: 'question_answered', label: 'Question answered', description: 'Customer received the requested answer' }],
  workflow: [{ id: 'get_order', label: 'Get order ID', description: 'Ask for the order reference', type: 'collect', references: ['order_id'] }],
});
test('validator accepts a valid blueprint', () => assert.deepEqual(plain(blueprintModule.validateAgentBlueprint(valid())), valid()));
test('validator rejects unsupported tool kind', () => { const b = valid(); b.tools[0].kind = 'javascript'; assert.throws(() => blueprintModule.validateAgentBlueprint(b), /tools\[0\].kind/); });
test('validator rejects unsupported rule operator', () => { const b = valid(); b.rules[0].operator = 'eval'; assert.throws(() => blueprintModule.validateAgentBlueprint(b), /rules\[0\].operator/); });
test('validator rejects duplicate data field key', () => { const b = valid(); b.dataFields.push({ ...b.dataFields[0] }); assert.throws(() => blueprintModule.validateAgentBlueprint(b), /duplicates/); });
test('validator rejects enum without options', () => { const b = valid(); b.dataFields[0].type = 'enum'; assert.throws(() => blueprintModule.validateAgentBlueprint(b), /enum choices/); });
test('validator rejects invalid workflow type', () => { const b = valid(); b.workflow[0].type = 'execute'; assert.throws(() => blueprintModule.validateAgentBlueprint(b), /workflow\[0\].type/); });
test('validator rejects rule sources and outcomes with broken references', () => { const first = valid(); first.rules[0].source = 'unknown_field'; assert.throws(() => blueprintModule.validateAgentBlueprint(first), /rules\[0\].source/); const second = valid(); second.tools[0].outcomeId = 'unknown_outcome'; assert.throws(() => blueprintModule.validateAgentBlueprint(second), /tools\[0\].outcomeId/); });

function compilerWith(fetch) { return load('lib/assembler/compiler.ts', { './blueprint': blueprintModule }, { fetch, process: { env: { ASSEMBLYAI_API_KEY: 'test-only-key' } } }); }
function routeWith(compiler) { return load('app/api/agents/compile/route.ts', { 'next/server': { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, json: async () => body }) } }, '@/lib/assembler/compiler': compiler }); }
const request = body => ({ json: async () => body });
test('compiler sends strict schema to gateway and returns validated blueprint', async () => {
  let sent;
  const compiler = compilerWith(async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(valid()) } }] }) }; });
  const result = await routeWith(compiler).POST(request({ intent: 'Handle order questions and find order status for callers.' }));
  assert.equal(result.status, 200); assert.deepEqual(plain((await result.json()).blueprint), valid());
  assert.equal(sent.response_format.type, 'json_schema'); assert.equal(sent.response_format.json_schema.strict, true); assert.equal(sent.stream, false);
});
test('route rejects invalid user input before gateway call', async () => { const compiler = compilerWith(async () => { throw new Error('Must not call gateway'); }); const result = await routeWith(compiler).POST(request({ intent: 'short' })); assert.equal(result.status, 400); });
test('route returns controlled gateway failure', async () => { const result = await routeWith(compilerWith(async () => ({ ok: false }))).POST(request({ intent: 'Handle order questions and find order status for callers.' })); assert.equal(result.status, 502); assert.match((await result.json()).error, /retry/i); });
test('route rejects malformed blueprint', async () => { const broken = valid(); broken.tools[0].kind = 'javascript'; const result = await routeWith(compilerWith(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(broken) } }] }) }))).POST(request({ intent: 'Handle order questions and find order status for callers.' })); assert.equal(result.status, 422); assert.match((await result.json()).error, /blueprint/i); });
