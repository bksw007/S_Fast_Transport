const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const records = new Map([
  ['today_jobs/job-1', { workOrder: 'JN-1', originOrganizationId: 'main', organizationId: 'partner', status: 'pending_subcontract', trackingShareToken: 'link-1' }],
  ['tracking_share_links/link-1', { statusLabel: 'รอรับงาน' }],
  ['drivers/driver-1', { organizationId: 'partner', status: 'available', userUid: 'user-1' }],
  ['vehicles/vehicle-1', { organizationId: 'partner', status: 'available', plate: 'กข 1234' }],
  ['users/user-1', { organizationId: 'partner', role: 'driver', active: true, approvalStatus: 'approved', fullName: 'คนขับทดสอบ', phone: '0812345678' }]
]);
let nextEvent = 0;
const ref = path => ({ path });
const snapshot = path => ({ exists: () => records.has(path), data: () => records.get(path) });
const firestore = {
  doc: (...parts) => parts.length === 1
    ? ref(`${parts[0]}/${++nextEvent}`)
    : ref(`${parts[1]}/${parts[2]}`),
  collection: (_db, name) => name,
  serverTimestamp: () => 'NOW',
  runTransaction: async (_db, action) => {
    const writes = [];
    const result = await action({
      get: async item => snapshot(item.path),
      update: (item, patch) => writes.push(() => records.set(item.path, { ...records.get(item.path), ...patch })),
      set: (item, value) => writes.push(() => records.set(item.path, value))
    });
    writes.forEach(write => write());
    return result;
  }
};
const context = {
  exports: {},
  require: name => {
    if (name === 'firebase/firestore') return firestore;
    if (name === './firebase') return { db: {} };
    if (name === '@s-fast-transport/shared') return { statusLabels: { subcontract_accepted: 'รับงานแล้ว', assigned: 'มอบหมายแล้ว' } };
    return {};
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

const actor = { uid: 'admin-1', displayName: 'แอดมินซับ', role: 'subcontract_admin', organizationId: 'partner', active: true, approvalStatus: 'approved' };
(async () => {
  await assert.rejects(context.exports.acceptSubcontractJob('job-1', { ...actor, organizationId: 'other' }), /ไม่พร้อมให้รับ/);
  assert.equal(records.get('today_jobs/job-1').status, 'pending_subcontract');
  await context.exports.acceptSubcontractJob('job-1', actor);
  assert.equal(records.get('today_jobs/job-1').status, 'subcontract_accepted');
  assert.equal(records.get('tracking_share_links/link-1').statusLabel, 'รับงานแล้ว');
  await assert.rejects(context.exports.acceptSubcontractJob('job-1', actor), /ไม่พร้อมให้รับ/);
  records.get('vehicles/vehicle-1').organizationId = 'other';
  await assert.rejects(context.exports.assignSubcontractJob('job-1', 'driver-1', 'vehicle-1', actor), /รถไม่พร้อมใช้งาน/);
  assert.equal(records.get('today_jobs/job-1').status, 'subcontract_accepted');
  records.get('vehicles/vehicle-1').organizationId = 'partner';
  await context.exports.assignSubcontractJob('job-1', 'driver-1', 'vehicle-1', actor);
  assert.equal(records.get('today_jobs/job-1').status, 'assigned');
  assert.equal(records.get('today_jobs/job-1').assignedDriverUid, 'user-1');
  assert.equal(records.get('tracking_share_links/link-1').vehicleLabel, 'กข 1234');
  await assert.rejects(context.exports.assignSubcontractJob('job-1', 'driver-1', 'vehicle-1', actor), /ไม่พร้อมมอบหมาย/);
  assert.equal([...records.values()].filter(value => value.type === 'subcontract_assigned').length, 1);
  console.log('PASS: subcontract acceptance and assignment validate ownership, write atomically, and resist duplicate actions');
})().catch(error => { console.error(error); process.exitCode = 1; });
