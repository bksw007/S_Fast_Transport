const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let actor, job, files, calls;
const jobId = 'job-1';
const ref = path => ({ path });
const db = {
  collection(name) {
    return {
      doc(id) { return { ...ref(`${name}/${id}`), async get() { const data = name === 'users' ? actor : name === 'today_jobs' ? job : undefined; return { exists: Boolean(data), data: () => data, ref: ref(`${name}/${id}`) }; } }; },
      where(field, op, value) { assert.equal(op, '=='); assert.equal(value, jobId); return { async get() { return { docs: name === 'job_events' ? [{ ref: ref('job_events/event-1') }] : name === 'tracking_share_links' ? [{ ref: ref('tracking_share_links/link-1') }] : [] }; } }; }
    };
  },
  bulkWriter() { return { delete(document) { calls.push(`delete:${document.path}`); return Promise.resolve(); }, async close() { calls.push('writer:close'); } }; },
  async recursiveDelete(document) { calls.push(`recursive:${document.path}`); }
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const context = { exports: {}, require: name => {
  if (name === 'firebase-admin/firestore') return { getFirestore: () => db };
  if (name === 'firebase-admin/storage') return { getStorage: () => ({ bucket: () => ({ getFiles: async () => [files] }) }) };
  if (name === 'firebase-functions/v2/https') return { HttpsError, onCall: (_options, handler) => handler };
  throw Error(name);
} };
const source = fs.readFileSync('functions-proof/src/permanent-job-deletion.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const handler = context.exports.permanentlyDeleteCancelledJob;
function reset() { actor = { role: 'admin', active: true, approvalStatus: 'approved', organizationId: 'main' }; job = { status: 'cancelled', workOrder: 'JN-001', organizationId: 'main' }; files = [{ delete: async () => { calls.push('storage:delete'); } }]; calls = []; }
const request = { auth: { uid: 'admin-1' }, data: { jobId, workOrder: 'JN-001' } };
(async () => {
  reset(); await assert.rejects(handler({ ...request, auth: null }), error => error.code === 'unauthenticated'); assert.equal(calls.length, 0);
  reset(); actor.role = 'driver'; await assert.rejects(handler(request), error => error.code === 'permission-denied'); assert.equal(calls.length, 0);
  reset(); job.status = 'completed'; await assert.rejects(handler(request), error => error.code === 'failed-precondition'); assert.equal(calls.length, 0);
  reset(); actor.role = 'subcontract_admin'; actor.organizationId = 'other'; await assert.rejects(handler(request), error => error.code === 'permission-denied'); assert.equal(calls.length, 0);
  reset(); await handler(request);
  assert.equal(calls[0], 'storage:delete');
  assert.ok(calls.includes('delete:tracking_share_links/link-1'));
  assert.ok(calls.includes('delete:job_events/event-1'));
  assert.ok(calls.includes('recursive:job_locations/job-1'));
  assert.equal(calls.at(-1), 'recursive:today_jobs/job-1');
  console.log('PASS: permanent deletion enforces access and cancelled state, then removes linked data before the job');
})().catch(error => { console.error(error); process.exitCode = 1; });
