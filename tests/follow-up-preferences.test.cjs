const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), {
    exports, Response, Date, Intl,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const prefs = load('lib/follow-up-preferences.ts');
const plain = value => JSON.parse(JSON.stringify(value));

function database(rows) {
  const writes = [];
  return {
    writes,
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        insert(value) { writes.push({ table, value: plain(value) }); return query; },
        update(value) { writes.push({ table, value: plain(value) }); return query; },
        async single() {
          assert.ok(rows.length, 'Unexpected database query');
          return { data: rows.shift(), error: null };
        },
      };
      return query;
    },
  };
}

function route(file, db) {
  return load(file, {
    '@/lib/follow-up-preferences': prefs,
    '@/lib/supabase/server': { createSupabaseServiceRoleClient: () => db },
    '@/lib/sms': { logSimulatedSms: async () => {} },
    '@/lib/assemblyai/client': {
      createAssemblyAIAgent: async () => ({ id: 'voice-agent' }),
      buildRuntimeSystemPrompt: input => `runtime prompt ${JSON.stringify(input)}`,
    },
  });
}
const request = body => ({ json: async () => body });

test('old rows default on; confirmation off always forces feedback off', () => {
  for (const value of [undefined, null, {}, { confirmation_call_enabled: null, feedback_enabled: null }]) {
    assert.deepEqual(plain(prefs.normalizeAgentFollowUpPreferences(value)), {
      confirmation_call_enabled: true, feedback_enabled: true,
    });
  }
  assert.deepEqual(plain(prefs.normalizeAgentFollowUpPreferences({ confirmation_call_enabled: false, feedback_enabled: true })), {
    confirmation_call_enabled: false, feedback_enabled: false,
  });
});

test('creation persists normalized preferences and Advanced defaults', async () => {
  for (const input of [
    {},
    { confirmation_call_enabled: false, feedback_enabled: true },
    { confirmation_call_enabled: true, feedback_enabled: false },
    {
      follow_up_preferences: {
        confirm_appointments_by_phone: false,
        collect_feedback_after_confirmation: false,
      },
    },
  ]) {
    const db = database([{ id: 'agent' }]);
    const response = await route('app/api/agents/route.ts', db).POST(request({ business_name: 'Test', name: 'Ava', ...input }));
    assert.equal(response.status, 201);
    const saved = db.writes[0].value;
    const expected = input.follow_up_preferences
      ? prefs.normalizeAgentFollowUpPreferences({
          confirmation_call_enabled: input.follow_up_preferences.confirm_appointments_by_phone,
          feedback_enabled: input.follow_up_preferences.collect_feedback_after_confirmation,
        })
      : prefs.normalizeAgentFollowUpPreferences(input);
    assert.equal(saved.confirmation_call_enabled, expected.confirmation_call_enabled);
    assert.equal(saved.feedback_enabled, expected.feedback_enabled);
  }
});

test('inbound runtime prompt reflects off follow-up and current local time', () => {
  const assembly = load('lib/assemblyai/client.ts');
  const prompt = assembly.buildRuntimeSystemPrompt({
    name: 'Ava',
    businessName: 'Test Clinic',
    agentPurpose: 'appointment_booking',
    timezone: 'Asia/Karachi',
    confirmationCallEnabled: false,
    feedbackEnabled: false,
  });

  assert.match(prompt, /Follow-up confirmation calls are disabled/);
  assert.match(prompt, /do not promise that the team will call, message, email, confirm, or follow up/);
  assert.match(prompt, /Your request has been saved\. Is there anything else I can help you with\?/);
  assert.match(prompt, /Current local date and time for this call:/);
  assert.match(prompt, /Resolve relative date phrases/);
});

test('disabled confirmation creates no call; enabled/legacy rows create calls', async () => {
  for (const agent of [{}, { confirmation_call_enabled: false }, { confirmation_call_enabled: true, feedback_enabled: false }]) {
    const db = database([{ calls: { agent_id: 'agent', agents: agent } }, { id: 'call' }]);
    const response = await route('app/api/calls/confirmation/start/route.ts', db).POST(request({ lead_id: 'lead' }));
    const body = await response.json();
    const enabled = agent.confirmation_call_enabled !== false;
    assert.equal(db.writes.length, enabled ? 1 : 0);
    assert.equal(response.status, enabled ? 201 : 200);
    if (!enabled) {
      assert.equal(body.status, 'disabled');
      assert.equal(body.message, prefs.FOLLOW_UP_DISABLED_MESSAGE);
    }
  }
});

test('feedback endpoint never writes when either preference is off', async () => {
  for (const agent of [{}, { feedback_enabled: false }, { confirmation_call_enabled: false, feedback_enabled: true }]) {
    const db = database([{ calls: { agents: agent } }, { feedback_rating: 5 }]);
    const response = await route('app/api/leads/[id]/feedback/route.ts', db).POST(request({ feedback_rating: 5 }), { params: Promise.resolve({ id: 'lead' }) });
    const body = await response.json();
    const enabled = prefs.normalizeAgentFollowUpPreferences(agent).feedback_enabled;
    assert.equal(db.writes.length, enabled ? 1 : 0);
    assert.equal(enabled ? body.feedback_rating : body.status, enabled ? 5 : 'disabled');
  }
});

function pageFunctions(file, names, extra = '') {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const scope = { ...prefs };
  vm.createContext(scope);
  vm.runInContext(compile(found.join('\n') + '\n' + extra), scope);
  return scope;
}

test('feedback-off prompt closes after booking, while legacy prompt keeps rating flow', () => {
  const scope = pageFunctions('app/confirm/[leadId]/page.tsx', ['buildConfirmationPrompt', 'displayValue']);
  const context = { lead: {}, feedback_enabled: false };
  const off = scope.buildConfirmationPrompt(context);
  assert.match(off, /Do not ask for a rating or feedback/);
  assert.match(off, /thank the customer and say Goodbye/);
  assert.doesNotMatch(off, /Step 5: once the caller gives a rating/);
  assert.match(scope.buildConfirmationPrompt({ lead: {} }), /Step 5: once the caller gives a rating/);
});

test('disabled feedback tool handler cannot call API even for an unexpected tool event', async () => {
  const scope = pageFunctions('app/confirm/[leadId]/page.tsx', ['handleToolCall'], 'const feedbackEnabledRef = { current: false };');
  // Other handler dependencies are deliberately absent: reaching them fails.
  await scope.handleToolCall({ name: 'capture_feedback', call_id: 'unexpected' });
});

test('client blocks disabled startup before requesting voice token or microphone', async () => {
  for (const disabledAt of ['context', 'start']) {
    const scope = pageFunctions('app/confirm/[leadId]/page.tsx', ['startCall']);
    const requests = [];
    const statuses = [];
    Object.assign(scope, {
      context: { lead: {} }, leadId: 'lead',
      setStatus: value => statuses.push(value), setTranscript() {}, setContext() {},
      transcriptTextRef: {}, hasEndedRef: {}, stopRequestedRef: {}, shouldAutoEndAfterReplyRef: {},
      clearAutoEndTimer() {},
      async fetchJson(url) {
        requests.push(url);
        if (url.endsWith('confirmation-context')) {
          return { lead: {}, confirmation_call_enabled: disabledAt !== 'context' };
        }
        assert.equal(url, '/api/calls/confirmation/start');
        return { status: 'disabled', confirmation_call_enabled: false };
      },
    });
    // No token/audio dependencies exist in this harness; accessing them fails.
    await scope.startCall();
    assert.equal(requests.length, disabledAt === 'context' ? 1 : 2);
    assert.equal(statuses.at(-1), prefs.FOLLOW_UP_DISABLED_MESSAGE);
  }
});

test('session exposes booking only when feedback is off', () => {
  const file = 'app/confirm/[leadId]/page.tsx';
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'tools') {
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression);
  for (const enabled of [true, false]) {
    const tools = vm.runInNewContext(compile(expression), { sessionContext: { feedback_enabled: enabled } });
    assert.deepEqual(plain(tools.map(tool => tool.name)), enabled
      ? ['assign_booking', 'capture_feedback'] : ['assign_booking']);
  }
});

test('inbound tool result flushes once whether api completion or reply.done happens first', async () => {
  const scope = pageFunctions('app/demo/page.tsx', ['handleToolCall', 'flushPendingToolResults']);

  function installHarness(fetchImpl) {
    const sent = [];
    Object.assign(scope, {
      WebSocket: { OPEN: 1 },
      wsRef: { current: { readyState: 1, send: value => sent.push(JSON.parse(value)) } },
      dbCallIdRef: { current: 'call' },
      stopRequestedRef: { current: false },
      handledToolCallsRef: { current: new Set() },
      toolTurnVersionRef: { current: 0 },
      pendingToolResultsRef: { current: [] },
      toolResultWindowOpenRef: { current: false },
      addTranscript() {},
      fetch: fetchImpl,
    });
    return sent;
  }

  const quickSent = installHarness(async () => ({
    ok: true,
    json: async () => ({ id: 'lead' }),
  }));
  await scope.handleToolCall({ name: 'capture_lead', call_id: 'tool-1', arguments: {} });
  assert.equal(quickSent.length, 0);
  assert.equal(scope.pendingToolResultsRef.current.length, 1);
  scope.toolResultWindowOpenRef.current = true;
  scope.flushPendingToolResults();
  assert.equal(quickSent.length, 1);
  scope.flushPendingToolResults();
  assert.equal(quickSent.length, 1);

  let resolveFetch;
  const slowSent = installHarness(() => new Promise(resolve => {
    resolveFetch = () => resolve({ ok: true, json: async () => ({ id: 'lead' }) });
  }));
  const pending = scope.handleToolCall({ name: 'capture_lead', call_id: 'tool-2', arguments: {} });
  scope.toolResultWindowOpenRef.current = true;
  scope.flushPendingToolResults();
  assert.equal(slowSent.length, 0);
  resolveFetch();
  await pending;
  assert.equal(slowSent.length, 1);

  await scope.handleToolCall({ name: 'capture_lead', call_id: 'tool-2', arguments: {} });
  assert.equal(slowSent.length, 1);
});

test('dashboard shows off stages, preserving completed bookings and ratings', () => {
  const scope = pageFunctions('app/dashboard/page.tsx', ['getLifecycleStages', 'hasValue', 'hasNumericRating']);
  const off = prefs.normalizeAgentFollowUpPreferences({ confirmation_call_enabled: false });
  const lead = { call_id: 'call', confirmation_status: 'pending', feedback_rating: null };
  const stages = scope.getLifecycleStages(lead, off);
  assert.deepEqual(plain(stages.map(stage => stage.label)), [
    'Inbound Call',
    'Lead Captured',
    'Booking Confirmed',
    'Feedback',
  ]);
  assert.equal(stages[2].statusText, 'Not applicable');
  assert.equal(stages[2].state, 'off');
  assert.equal(stages[3].statusText, 'Not applicable');
  const completed = scope.getLifecycleStages({ ...lead, booking_id: 'BK1', confirmation_status: 'confirmed', feedback_rating: 5 }, off);
  assert.equal(completed[2].state, 'completed');
  assert.equal(completed[3].state, 'completed');
});
