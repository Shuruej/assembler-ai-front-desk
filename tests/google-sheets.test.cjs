const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(fetchImpl = async () => ({ ok: true, text: async () => '{}' })) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('lib/google-sheets.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    console,
    URL,
    AbortSignal,
    fetch: fetchImpl,
    require(name) {
      if (name === './google-calendar') {
        return { getAccessTokenFromRefreshToken: async () => 'access-token' };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports;
}
test('Google Sheets accepts a pasted spreadsheet URL or raw id', () => {
  const sheets = load();
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz';
  assert.equal(
    sheets.parseGoogleSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`),
    id,
  );
  assert.equal(sheets.parseGoogleSpreadsheetId(id), id);
  assert.throws(() => sheets.parseGoogleSpreadsheetId('not a sheet'), /valid Google Sheets/);
});

test('Google Sheets config validation rejects incomplete setup', () => {
  const sheets = load();
  const config = sheets.validateGoogleSheetsConfig({
    spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    spreadsheetTitle: 'Support Intake',
    sheetName: 'Assembler Records',
  });
  assert.equal(config.sheetName, 'Assembler Records');
  assert.throws(() => sheets.validateGoogleSheetsConfig({ spreadsheetId: 'abc' }), /incomplete/);
});
test('record sync creates headers before appending the first row', async () => {
  const calls = [];
  const sheets = load(async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body });
    if ((options.method || 'GET') === 'GET') {
      return { ok: true, text: async () => '{"values":[]}' };
    }
    return { ok: true, text: async () => '{}' };
  });

  await sheets.appendRecordToGoogleSheet(
    'refresh-token',
    {
      spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      spreadsheetTitle: 'Support Intake',
      sheetName: 'Assembler Records',
    },
    {
      recordType: 'save_request',
      callId: 'call-1',
      payload: { customer_name: 'Ali' },
      fields: [{ key: 'customer_name', label: 'Customer name' }],
    },
  );

  assert.deepEqual(calls.map((call) => call.method), ['GET', 'PUT', 'POST']);
  assert.match(calls[2].url, /:append/);
  assert.match(String(calls[2].body), /Ali/);
});
