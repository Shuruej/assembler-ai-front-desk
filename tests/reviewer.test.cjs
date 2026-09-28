const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function load() {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('lib/reviewer.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    crypto: webcrypto,
    TextEncoder,
    URL,
    Request,
    btoa,
    process: {
      env: {
        REVIEWER_SESSION_SECRET: 'unit-test-session-secret-32-bytes-minimum',
        REVIEWER_ACCESS_TOKEN: 'unit-test-access-token',
      },
    },
  });
  return exports;
}

test('reviewer access token accepts only the configured token', async () => {
  const reviewer = load();
  assert.equal(await reviewer.verifyReviewerAccessToken('unit-test-access-token'), true);
  assert.equal(await reviewer.verifyReviewerAccessToken('wrong-token'), false);
  assert.equal(await reviewer.verifyReviewerAccessToken(null), false);
});

test('reviewer session cookie verifies on a public host', async () => {
  const reviewer = load();
  const session = await reviewer.createReviewerSessionCookie();
  const request = new Request('https://judge-demo.example/api/agents', {
    headers: { cookie: `${session.name}=${session.value}` },
  });
  const reviewerId = await reviewer.getReviewerSessionId(request);
  assert.ok(reviewerId);
  assert.match(reviewerId, /^[0-9a-f-]{36}$/i);
});

test('tampered reviewer cookie is rejected', async () => {
  const reviewer = load();
  const session = await reviewer.createReviewerSessionCookie();
  const request = new Request('https://judge-demo.example/api/agents', {
    headers: { cookie: `${session.name}=${session.value}x` },
  });
  assert.equal(await reviewer.getReviewerSessionId(request), null);
});

test('localhost bypass stays available for development', async () => {
  const reviewer = load();
  assert.equal(await reviewer.getReviewerSessionId(new Request('http://localhost:3000/api/agents')), null);
  assert.equal(reviewer.isLocalReviewerRequest(new Request('http://127.0.0.1:3000/api/agents')), true);
});
