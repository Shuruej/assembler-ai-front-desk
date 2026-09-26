const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const net = require('node:net');

function load(path, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, console, Buffer, URL, Request, Response, AbortSignal, process: { env: { NODE_ENV: 'development', CONNECTION_ENCRYPTION_KEY: 'a'.repeat(64) } }, ...globals, require(name) { if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`); return dependencies[name]; } });
  return exports;
}
const rules = load('lib/assembler/rules.ts');
const registry = load('lib/assembler/registry.ts', { './rules': rules });
const records = load('lib/assembler/records.ts');
const connections = load('lib/assembler/connections.ts', { 'node:crypto': crypto, 'node:net': net });
const basic = () => ({
  dataFields: [{ key: 'order_id', label: 'Order ID', type: 'string', required: true, options: [] }],
  tools: [{ id: 'save_order', kind: 'internal_record', operation: 'create_record', inputs: [{ key: 'order_id', type: 'string', required: true }], outcomeId: null }, { id: 'escalate_issue', kind: 'escalation', operation: 'escalate', inputs: [{ key: 'reason', type: 'string', required: true }], outcomeId: null }],
  rules: [], outcomes: [],
});
const executor = async (_tool, args) => ({ success: true, data: { saved: args.order_id } });
const executors = { internal_record: executor, escalation: executor, calendar: executor, http: executor, webhook: executor };
test('every rule operator has deterministic behavior', () => {
  const cases = [
    ['equals', 5, 5, true], ['not_equals', 5, 4, true], ['contains', 'Brake FAILURE reported', 'brake failure', true],
    ['greater_than', 6, 5, true], ['less_than', 4, 5, true], ['exists', 'present', null, true],
    ['contains', 5, '5', false], ['greater_than', '6', 5, false], ['exists', '', null, false],
  ];
  for (const [operator, actual, value, expected] of cases) assert.equal(rules.matchesRule({ source: 'field', operator, value }, { field: actual }), expected, operator);
});
test('registry executes an approved internal record tool', async () => {
  const result = await registry.dispatchBlueprintTool({ blueprint: basic(), toolId: 'save_order', arguments: { order_id: 'A-123' }, executors });
  assert.equal(result.success, true); assert.equal(result.data.saved, 'A-123');
});
test('registry rejects unknown tools and invalid arguments', async () => {
  const blueprint = basic();
  assert.equal((await registry.dispatchBlueprintTool({ blueprint, toolId: 'unknown', arguments: {}, executors })).code, 'unknown_tool');
  assert.equal((await registry.dispatchBlueprintTool({ blueprint, toolId: 'save_order', arguments: {}, executors })).code, 'invalid_arguments');
  assert.equal((await registry.dispatchBlueprintTool({ blueprint, toolId: 'save_order', arguments: { order_id: 'A', secret: 'no' }, executors })).code, 'invalid_arguments');
});
test('registry contains executor crashes', async () => {
  const result = await registry.dispatchBlueprintTool({ blueprint: basic(), toolId: 'save_order', arguments: { order_id: 'A' }, executors: { ...executors, internal_record: async () => { throw new Error('private upstream detail'); } } });
  assert.equal(result.code, 'executor_failure'); assert.doesNotMatch(result.error, /private upstream detail/);
});
test('record values follow blueprint fields', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(records.validateRecordPayload(basic(), { order_id: 'A' }))), { order_id: 'A' });
  assert.throws(() => records.validateRecordPayload(basic(), { secret: 'bad' }), /unapproved/);
  assert.throws(() => records.validateRecordPayload(basic(), {}), /required/);
});
test('connection secrets are authenticated and never plaintext', () => {
  const encrypted = connections.encryptSecret('Bearer private-token');
  assert.doesNotMatch(encrypted, /private-token/);
  assert.equal(connections.decryptSecret(encrypted), 'Bearer private-token');
  assert.throws(() => connections.decryptSecret(encrypted.slice(0, -2) + 'zz'));
});
test('outbound HTTP uses fixed URL and returns structured result', async () => {
  let observed;
  const result = await connections.executeOutbound({ url: 'https://example.com/orders', method: 'GET' }, { order_id: 'A 1' }, null, async (url, options) => { observed = { url: String(url), options }; return { ok: true, text: async () => '{"status":"shipped"}' }; });
  assert.equal(result.status, 'shipped'); assert.match(observed.url, /order_id=A\+1/); assert.equal(observed.options.redirect, 'error');
});
test('outbound HTTP rejects unsafe schemes, private IPs, and times out cleanly', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/a', 'http://example.com/a', 'https://127.0.0.1/a']) assert.throws(() => connections.validateOutboundConfig({ url, method: 'GET' }, 'http'));
  await assert.rejects(() => connections.executeOutbound({ url: 'https://example.com/a', method: 'GET' }, {}, null, async () => { throw new Error('timeout'); }), /timeout/);
});
test('connection listing projects only non-secret columns', async () => {
  let selection = '';
  const query = { select(columns) { selection = columns; return query; }, eq() { return query; }, order: async () => ({ data: [], error: null }) };
  const route = load('app/api/agents/[id]/connections/route.ts', {
    '@/lib/supabase/server': { createSupabaseServiceRoleClient: () => ({ from: () => query }) },
    '@/lib/assembler/blueprint': {}, '@/lib/assembler/connections': connections,
  });
  const response = await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'agent' }) });
  assert.equal(response.status, 200);
  assert.doesNotMatch(selection, /secret|token|credential/i);
});
