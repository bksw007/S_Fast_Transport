const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let records, writes;
const firestore = {
  doc: (_, ...parts) => parts.join('/'), collection: (_, name) => name,
  getDoc: async path => ({ exists: () => Boolean(records[path]), data: () => records[path] }),
  addDoc: async (path, data) => { writes.push({ path, data }); },
  serverTimestamp: () => 'SERVER_TIME'
};
const context = { exports: {}, require: name => {
  if (name === 'firebase/firestore') return firestore;
  if (name === './settings-repository') return { loadCompanySettings: async () => ({ name: 'Company' }) };
  return { db: {}, storage: {} };
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const actor = { uid: 'admin', organizationId: 'main' };
const draft = { driverId: 'driver-b', driverName: 'Stale name', driverPhone: 'old', workOrder: 'WO-1' };
function reset() {
  writes = [];
  records = {
    'drivers/driver-a': { organizationId: 'main', userUid: 'user-a', name: 'Same name', phone: '111', status: 'available' },
    'drivers/driver-b': { organizationId: 'main', userUid: 'user-b', name: 'Same name', phone: '222', status: 'available' },
    'users/user-b': { organizationId: 'main', fullName: 'Same name', phone: '333', role: 'driver', active: true, approvalStatus: 'approved' }
  };
}
(async () => {
  reset(); await context.exports.createJob(draft, actor);
  assert.equal(writes[0].data.assignedDriverUid, 'user-b');
  assert.equal(writes[0].data.driverId, 'driver-b');
  assert.equal(writes[0].data.driverName, 'Same name');
  assert.equal(writes[0].data.driverPhone, '333');
  reset(); records['users/user-b'].phone = ''; await context.exports.createJob(draft, actor);
  assert.equal(writes[0].data.driverPhone, '222');
  const invalid = [
    () => delete records['drivers/driver-b'],
    () => { records['drivers/driver-b'].status = 'inactive'; },
    () => { records['drivers/driver-b'].organizationId = 'other'; },
    () => { records['drivers/driver-b'].userUid = ''; },
    () => delete records['users/user-b'],
    () => { records['users/user-b'].active = false; },
    () => { records['users/user-b'].approvalStatus = 'pending'; },
    () => { records['users/user-b'].role = 'admin'; },
    () => { records['users/user-b'].organizationId = 'other'; }
  ];
  for (const change of invalid) {
    reset(); change(); await assert.rejects(() => context.exports.createJob(draft, actor)); assert.equal(writes.length, 0);
  }
  reset(); await assert.rejects(() => context.exports.createJob({ ...draft, driverId: '' }, actor)); assert.equal(writes.length, 0);
  console.log('PASS: driver identity, automatic phone, fallback, and invalid assignment protection');
})().catch(error => { console.error(error); process.exitCode = 1; });
