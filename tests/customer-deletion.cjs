const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const rows = new Map([
  ['customers/old', { name: 'Acme', aliases: ['Acme', 'Old Acme'], active: true }],
  ['customer_names/acme', { customerId: 'old' }],
  ['customer_names/old%20acme', { customerId: 'old' }],
  ['organizations/main/list_options/customer--acme', { organizationId: 'main', field: 'customer', value: 'Acme' }],
  ['organizations/main/list_options/customer--old%20acme', { organizationId: 'main', field: 'customer', value: 'Old Acme' }]
]);
const ref = path => ({ path, id: path.split('/').at(-1) });
const snap = item => ({ id: item.id, ref: item, exists: () => rows.has(item.path), data: () => rows.get(item.path) });
const firestore = {
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  doc: (parent, ...parts) => ref(typeof parent === 'object' && parent.path ? [parent.path, ...(parts.length ? parts : ['new'])].join('/') : parts.join('/')),
  getDoc: async item => snap(item),
  getDocs: async col => ({ docs: [...rows.keys()].filter(path => path.startsWith(`${col.path}/`) && path.slice(col.path.length + 1).indexOf('/') < 0).map(path => snap(ref(path))) }),
  onSnapshot: (col, receive) => { receive({ docs: [...rows.keys()].filter(path => path.startsWith(`${col.path}/`) && path.slice(col.path.length + 1).indexOf('/') < 0).map(path => snap(ref(path))) }); return () => {}; },
  runTransaction: async (_db, callback) => callback({
    get: async item => snap(item),
    update: (item, data) => rows.set(item.path, { ...rows.get(item.path), ...data }),
    delete: item => rows.delete(item.path),
    set: (item, data, options) => rows.set(item.path, options?.merge ? { ...rows.get(item.path), ...data } : data)
  }),
  serverTimestamp: () => 'NOW'
};
const context = { exports: {}, require: name => name === 'firebase/firestore' ? firestore : name === './firebase' ? { db: {} } : {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/customer-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);

(async () => {
  const actor = { uid: 'admin', active: true, approvalStatus: 'approved', organizationId: 'main', organizationType: 'main', role: 'admin' };
  await assert.rejects(context.exports.deleteCustomer({ id: 'old' }, { ...actor, role: 'customer' }), /ผู้ดูแล/);
  await context.exports.deleteCustomer({ id: 'old' }, actor);
  assert.equal(rows.get('customers/old').active, false);
  assert.equal(rows.get('customers/old').deletedAt, 'NOW');
  assert.equal(rows.has('customer_names/acme'), false);
  assert.equal(rows.has('customer_names/old%20acme'), false);
  assert.equal(rows.has('organizations/main/list_options/customer--acme'), false);
  let visible;
  context.exports.subscribeCustomers(items => { visible = items; }, () => {});
  assert.equal(visible.length, 0);
  assert.equal(await context.exports.resolveCustomerId('Acme', actor), 'new');
  assert.equal(rows.get('customer_names/acme').customerId, 'new');
  assert.equal(rows.get('customers/old').name, 'Acme', 'historical customer record remains intact');
  console.log('PASS: deleting a customer hides it, preserves history, and frees its name for new jobs');
})().catch(error => { console.error(error); process.exitCode = 1; });
