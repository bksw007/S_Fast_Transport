const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let request;
const context = {
  exports: {},
  require: name => {
    if (name === './firebase-auth') return { auth: { currentUser: { getIdToken: async () => 'signed-in-token' } } };
    if (name === './google-routes-distance') return { coordinateFingerprint: (from, to) => from && to ? 'valid' : null };
    throw new Error(`Unexpected import: ${name}`);
  },
  fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ distanceMeters: 24567 }) };
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/job-road-distance-client.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, context);

(async () => {
  const origin = { lat: 13.7563, lng: 100.5018 };
  const destination = { lat: 13.65, lng: 100.65 };
  assert.equal(await context.exports.requestJobRoadDistance('job-1', origin, destination), 24567);
  assert.equal(request.url, '/api/maps/distance');
  assert.equal(request.options.headers.Authorization, 'Bearer signed-in-token');
  assert.deepEqual(JSON.parse(request.options.body), { jobId: 'job-1', origin, destination });
  await context.exports.requestJobRoadDistance('job-1', destination, origin, 'return');
  assert.deepEqual(JSON.parse(request.options.body), { jobId: 'job-1', origin: destination, destination: origin, leg: 'return' });
  await assert.rejects(() => context.exports.requestJobRoadDistance('job-1', null, destination), /พิกัด/);
  context.fetch = async () => ({ ok: false, json: async () => ({ error: 'route unavailable' }) });
  await assert.rejects(() => context.exports.requestJobRoadDistance('job-1', origin, destination), /route unavailable/);
  console.log('PASS: job road distance requests the protected route API with the current user token');
})().catch(error => { console.error(error); process.exitCode = 1; });
