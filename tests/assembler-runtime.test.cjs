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
test('successful tool records only its blueprint-approved outcome', async () => {
  const blueprint = basic();
  blueprint.outcomes = [{ id: 'request_saved' }];
  blueprint.tools[0].outcomeId = 'request_saved';
  const saved = [];
  const result = await registry.dispatchBlueprintTool({ blueprint, toolId: 'save_order', arguments: { order_id: 'A-123' }, executors, setOutcome: async id => saved.push(id) });
  assert.equal(result.outcome, 'request_saved'); assert.deepEqual(saved, ['request_saved']);
});
test('rule-triggered escalation persists the escalation tool outcome', async () => {
  const blueprint = basic();
  blueprint.outcomes = [{ id: 'human_follow_up' }];
  blueprint.tools[1].outcomeId = 'human_follow_up';
  blueprint.rules = [{ source: 'order_id', operator: 'equals', value: 'COMPLAINT', action: 'require_escalation', target: 'save_order', description: 'A team member should follow up.' }];
  const saved = [];
  const result = await registry.dispatchBlueprintTool({ blueprint, toolId: 'save_order', arguments: { order_id: 'COMPLAINT' }, executors, setOutcome: async id => saved.push(id) });
  assert.equal(result.outcome, 'human_follow_up'); assert.deepEqual(saved, ['human_follow_up']);
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
test('blueprint agent uses flat AssemblyAI voice tools and a blueprint prompt', async () => {
  let sent;
  const voice = load('lib/assemblyai/client.ts', {}, {
    process: { env: { ASSEMBLYAI_API_KEY: 'test-key' } },
    fetch: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 'voice-agent' }) }; },
  });
  const blueprint = { identity: { name: 'Mira', role: 'Order support agent' }, objective: 'Resolve order questions', greeting: 'Hello', behavior: { instructions: [] }, knowledge: { requirements: [] }, dataFields: [], rules: [], outcomes: [], tools: [{ id: 'lookup_order', name: 'Look up order', description: 'Call when a customer asks for order status.', kind: 'http', operation: 'http_request', inputs: [{ key: 'order_id', type: 'string', description: 'Customer order ID', required: true }], expectedResult: 'Order status', connectionId: 'order_api', outcomeId: null }] };
  await voice.createAssemblyAIAgent({ name: 'Mira', businessName: 'Example Shop', businessHoursStart: '09:00', businessHoursEnd: '17:00', businessDays: 'mon,tue,wed,fri', blueprint });
  assert.equal(sent.tools[0].type, 'function');
  assert.equal(sent.tools[0].name, 'lookup_order');
  assert.equal(sent.tools[0].parameters.properties.order_id.type, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(sent.tools[0].parameters.required)), ['order_id']);
  assert.match(sent.system_prompt, /Resolve order questions/);
  assert.doesNotMatch(sent.system_prompt, /capture_lead/);
});
test('tool execution logs only approved tool and argument names', async () => {
  const writes = [];
  const blueprint = basic();
  const db = { from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      async single() { return { data: table === 'calls' ? { id: 'call', agent_id: 'agent', status: 'in_progress' } : { id: 'agent', blueprint }, error: null }; },
      insert(value) { writes.push({ table, value }); return Promise.resolve({ error: null }); },
    };
    return query;
  } };
  const route = load('app/api/agents/tools/execute/route.ts', {
    '@/lib/supabase/server': { createSupabaseServiceRoleClient: () => db },
    '@/lib/assembler/blueprint': { validateAgentBlueprint: value => value },
    '@/lib/assembler/connections': connections,
    '@/lib/assembler/registry': { dispatchBlueprintTool: async () => ({ success: false, code: 'invalid_arguments', error: 'Invalid' }) },
    '@/lib/assembler/records': records,
    '@/lib/google-sheets': { appendRecordToGoogleSheet: async () => {}, validateGoogleSheetsConfig: value => value },
    '@/app/api/availability/check/route': { POST: async () => {} },
    '@/app/api/availability/book/route': { POST: async () => {} },
    '@/app/api/leads/escalate/route': { POST: async () => {} },
  });
  await route.POST(new Request('http://localhost/api/agents/tools/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ call_id: 'call', tool_id: 'save_order', arguments: { order_id: 'A1', 'Bearer secret': 'private' } }) }));
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].value.argument_keys)), ['order_id']);
  assert.equal(writes[0].value.tool_id, 'save_order');
  assert.doesNotMatch(JSON.stringify(writes[0]), /private|Bearer/);
});
test('blueprint creation stops before minting a voice agent when storage is absent', async () => {
  let minted = 0;
  const query = { select() { return query; }, async limit() { return { error: { code: '42703' } }; } };
  const route = load('app/api/agents/route.ts', {
    '@/lib/assemblyai/client': { createAssemblyAIAgent: async () => { minted++; return { id: 'voice' }; } },
    '@/lib/supabase/server': { createSupabaseServiceRoleClient: () => ({ from: () => query }) },
    '@/lib/assembler/blueprint': { validateAgentBlueprint: value => value, BlueprintValidationError: class extends Error {} },
    '@/lib/follow-up-preferences': { normalizeFollowUpPreferences: () => ({ confirm_appointments_by_phone: false, collect_feedback_after_confirmation: false }), normalizeAgentFollowUpPreferences: () => ({ confirmation_call_enabled: false, feedback_enabled: false }) },
  });
  const response = await route.POST(new Request('http://localhost/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ business_name: 'Shop', name: 'Mira', blueprint: basic() }) }));
  assert.equal(response.status, 503); assert.equal(minted, 0);
});
