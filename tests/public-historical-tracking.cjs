const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const jobId = 'job-1';
const evidence = {
  pickup: [`historical_jobs/${jobId}/admin/pickup/1.jpg`],
  delivery: [`historical_jobs/${jobId}/admin/delivery/1.jpg`],
  document: [`historical_jobs/${jobId}/admin/document/1.jpg`],
  expense: [`historical_jobs/${jobId}/admin/expense/private.jpg`]
};
const pickupPlace = { lat: 13.7563, lng: 100.5018 };
const deliveryPlace = { lat: 13.65, lng: 100.65 };
const job = { historical: true, organizationId: 'main', workOrder: 'JN-20261010001PE', status: 'completed', historicalEvidence: evidence,
  pickupPlace, deliveryPlace, routeDistanceMeters: 24567, routeDistanceFingerprint: '13.756300,100.501800>13.650000,100.650000', routeDistanceProvider: 'google_routes',
  returnTrip: { pickupPlace: deliveryPlace, deliveryPlace: pickupPlace }, returnRouteDistanceMeters: 26700,
  returnRouteDistanceFingerprint: '13.650000,100.650000>13.756300,100.501800', returnRouteDistanceProvider: 'google_routes' };
let streamedPath = '';
const mocks = {
  'firebase-admin/firestore': { getFirestore: () => ({ collection: name => ({ doc: () => ({ get: async () => ({ data: () => name === 'today_jobs' ? job : { enabled: true, expiresAt: { toMillis: () => Date.now() + 60_000 }, jobId, organizationId: 'main' } }) }) }) }) },
  'firebase-admin/storage': { getStorage: () => ({ bucket: () => ({ file: path => ({ getMetadata: async () => [{ contentType: 'image/jpeg' }], createReadStream: () => ({ on: () => ({ pipe: () => { streamedPath = path; } }) }) }) }) }) },
  'firebase-functions/v2/https': { onRequest: (_options, handler) => handler },
  'firebase-functions': { logger: { error: () => {} } }
};
const context = { exports: {}, require: name => mocks[name], Date, Number, String };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('functions-proof/src/public-tracking.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

async function request(query) {
  const result = { statusCode: 200, body: null, headers: {}, set(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; }, json(body) { this.body = body; } };
  streamedPath = '';
  await context.exports.publicTrackingAccess({ method: 'GET', query: { token: 'a'.repeat(32), ...query } }, result);
  return { result, streamedPath };
}

(async () => {
  const details = (await request({})).result.body;
  assert.equal(details.historical, true);
  assert.equal(details.pickupProof.photoCount, 1);
  assert.equal(details.deliveryProof.hasSignature, false);
  assert.equal(details.documentPhotoCount, 1);
  assert.equal(details.routeDistanceMeters, 24567);
  assert.equal(details.returnRouteDistanceMeters, 26700);
  assert.equal(details.totalRouteDistanceMeters, 51267);
  job.returnTrip.deliveryPlace = { lat: 14, lng: 101 };
  assert.equal((await request({})).result.body.totalRouteDistanceMeters, null, 'stale return distance must not become a public total');
  job.returnTrip.deliveryPlace = pickupPlace;
  const savedReturnTrip = job.returnTrip;
  delete job.returnTrip;
  assert.equal((await request({})).result.body.totalRouteDistanceMeters, 24567, 'one-way public jobs keep the outward total');
  job.returnTrip = savedReturnTrip;
  assert.ok(!JSON.stringify(details).includes('private.jpg'));
  assert.equal((await request({ kind: 'photo', stage: 'document', index: '0' })).streamedPath, evidence.document[0]);
  assert.equal((await request({ kind: 'photo', stage: 'expense', index: '0' })).result.statusCode, 404);
  assert.equal((await request({ kind: 'photo', stage: 'pickup', index: '1' })).result.statusCode, 404);
  job.historicalEvidence.pickup = [evidence.expense[0]];
  assert.equal((await request({ kind: 'photo', stage: 'pickup', index: '0' })).result.statusCode, 404, 'a misplaced expense path must stay private');
  console.log('PASS: historical share link exposes delivery evidence and excludes expense photos');
})().catch(error => { console.error(error); process.exitCode = 1; });
