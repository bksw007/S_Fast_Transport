const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let linked = '';
let update;
const firestore = {
  collection: (_db, name) => name,
  doc: (_db, name, id) => `${name}/${id}`,
  where: (_field, _operator, value) => value,
  limit: value => value,
  query: (name, organizationId) => ({ name, organizationId }),
  getDocs: async ({ name }) => ({ empty: name !== linked, docs: name === 'today_jobs' && linked === 'today_jobs' ? [{ data: () => ({ status: 'pending_subcontract' }) }] : [] }),
  updateDoc: async (path, data) => { update = { path, data }; },
  serverTimestamp: () => 'NOW'
};
const context = {
  exports: {},
  require(name) {
    if (name === 'firebase/firestore') return firestore;
    if (name === './firebase') return { db: {} };
    if (name === './transport-repository') return { isMainAdmin: () => true };
    if (name === 'firebase/storage' || name.startsWith('./')) return {};
    throw new Error(`Unexpected import ${name}`);
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/resource-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

(async () => {
  const actor = { organizationId: 'main', organizationType: 'main', uid: 'admin' };
  linked = 'users';
  await assert.rejects(context.exports.deleteSubcontractOrganization('partner', actor), /บัญชีผู้ใช้/);
  assert.equal(update, undefined);
  linked = 'today_jobs';
  await assert.rejects(context.exports.deleteSubcontractOrganization('partner', actor), /ใบงานที่ไม่จบ/);
  assert.equal(update, undefined);
  linked = '';
  await context.exports.deleteSubcontractOrganization('partner', actor);
  assert.equal(update.path, 'organizations/partner');
  assert.equal(update.data.deleted, true);
  assert.equal(update.data.active, false);
  console.log('PASS: linked companies cannot be removed; unused companies disappear without erasing history');
})().catch(error => { console.error(error); process.exitCode = 1; });
