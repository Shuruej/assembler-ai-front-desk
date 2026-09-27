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

function compilerWith() { return load('lib/assembler/compiler.ts', { './blueprint': blueprintModule }, { fetch() { throw new Error('Local assembly must never fetch'); } }); }
function routeWith(compiler) { return load('app/api/agents/compile/route.ts', { 'next/server': { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, json: async () => body }) } }, '@/lib/assembler/compiler': compiler }); }
const request = body => ({ json: async () => body });
test('local assembly builds distinct, valid Auto Repair, Ecommerce and Real Estate blueprints without a network request', async () => {
  const compiler = compilerWith();
  const route = routeWith(compiler);
  const blueprints = [];
  for (const starter of compiler.STARTER_WORKFLOWS.slice(0, 3)) {
    const result = await route.POST(request({ intent: starter.intent, starterId: starter.id }));
    assert.equal(result.status, 200);
    const blueprint = (await result.json()).blueprint;
    blueprintModule.validateAgentBlueprint(blueprint);
    blueprints.push(blueprint);
  }
  assert.ok(blueprints[0].dataFields.some(field => field.key === 'vehicle'));
  assert.ok(blueprints[0].tools.some(tool => tool.operation === 'create_booking'));
  assert.ok(blueprints[1].connections.some(connection => connection.id === 'order_api'));
  assert.ok(blueprints[1].tools.some(tool => tool.id === 'lookup_order'));
  assert.ok(blueprints[2].dataFields.some(field => field.key === 'budget'));
  assert.equal(blueprints[2].connections.length, 0);
});
test('route rejects short descriptions', async () => { const result = await routeWith(compilerWith()).POST(request({ intent: 'short' })); assert.equal(result.status, 400); });
test('route rejects unknown starter IDs', async () => { const result = await routeWith(compilerWith()).POST(request({ intent: 'Handle order questions and find order status for callers.', starterId: 'unknown' })); assert.equal(result.status, 400); });
test('start from scratch assembles a generic record blueprint using edited intent', async () => { const intent = 'Collect the caller contact details and record their specific business request.'; const result = await routeWith(compilerWith()).POST(request({ intent, starterId: null })); assert.equal(result.status, 200); const blueprint = (await result.json()).blueprint; assert.equal(blueprint.objective, intent); assert.equal(blueprint.connections.length, 0); assert.ok(blueprint.tools.some(tool => tool.operation === 'create_record')); });
test('all starter blueprints validate and intent-only callers keep the same route contract', async () => { const compiler = compilerWith(); const route = routeWith(compiler); for (const starter of compiler.STARTER_WORKFLOWS) { const result = await route.POST(request({ intent: starter.intent, starterId: starter.id })); assert.equal(result.status, 200); blueprintModule.validateAgentBlueprint((await result.json()).blueprint); } const plainResult = await route.POST(request({ intent: 'Collect customer details and record a request for a callback.' })); assert.equal(plainResult.status, 200); });
test('local assembly accepts the documented description limit', () => { const blueprint = compilerWith().assembleAgentBlueprint('Record a customer request. '.repeat(180)); assert.ok(blueprint.behavior.instructions.some(text => text.startsWith('Additional workflow detail:'))); });
