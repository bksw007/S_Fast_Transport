const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const removed = Symbol('deleteField');
const records = new Map([
  ['today_jobs/job-1', { id: 'job-1', organizationId: 'main', originOrganizationId: 'main', status: 'assigned', trackingStatus: 'not_started', trackingEnabled: false, driverId: 'old-driver', assignedDriverUid: 'old-user', driverName: 'Old Driver', vehiclePlate: 'OLD', carrierName: 'S Fast Transport' }],
  ['organizations/main', { name: 'S Fast Transport' }],
  ['organizations/partner', { type: 'subcontract', active: true, name: 'Partner Transport' }],
  ['tracking_share_links/link-1', { jobId: 'job-1', organizationId: 'main', enabled: true, carrierName: 'S Fast Transport' }],
  ['drivers/new-driver', { organizationId: 'main', status: 'available', userUid: 'new-user', name: 'New Driver' }],
  ['users/new-user', { organizationId: 'main', active: true, approvalStatus: 'approved', fullName: 'New Driver' }]
]);
const ref = path => ({ path });
const snapshot = path => ({ exists: () => records.has(path), data: () => records.get(path) });
const update = (path, patch) => {
  const next = { ...records.get(path) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === removed) delete next[key]; else next[key] = value;
  }
  records.set(path, next);
};
const firestore = {
  collection: (_db, name) => ref(name),
  doc: (base, name, id) => ref(id === undefined ? `${base.path}/event-1` : `${name}/${id}`),
  getDoc: async target => snapshot(target.path),
  getDocs: async criteria => ({ docs: [...records.keys()].filter(path => path.startsWith(`${criteria.path}/`)).filter(path => criteria.filters.every(([field, value]) => records.get(path)[field] === value)).map(path => ({ ref: ref(path), data: () => records.get(path) })) }),
  query: (base, ...filters) => ({ path: base.path, filters }),
  where: (field, _operator, value) => [field, value],
  runTransaction: async (_db, action) => action({ get: async target => snapshot(target.path), update: (target, patch) => update(target.path, patch), set: (target, value) => records.set(target.path, value) }),
  writeBatch: () => ({ update: (target, patch) => update(target.path, patch), commit: async () => {} }),
  deleteField: () => removed,
  serverTimestamp: () => 'NOW'
};
const context = { exports: {}, require(name) {
  if (name === 'firebase/firestore') return firestore;
  if (name === './firebase') return { db: {} };
  if (name === 'firebase/functions') return {};
  if (name === './transport-repository') return { hasApprovedAccess: () => true, isMainAdmin: actor => actor.organizationId === 'main', canReceiveDriverJobs: () => true };
  if (name === '@s-fast-transport/shared') return { statusLabels: { assigned: 'มอบหมายแล้ว', pending_subcontract: 'รอบริษัทซับรับงาน' } };
  if (name === './google-routes-distance') return { coordinateFingerprint: () => '' };
  if (name === './job-edit') return { validateJobEditDraft: draft => draft };
  if (name === './customer-repository') return { resolveCustomerId: async () => null };
  throw new Error(`Unexpected import ${name}`);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/job-detail-repository.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, context);

const actor = { uid: 'admin', displayName: 'Admin', organizationId: 'main', organizationName: 'S Fast Transport' };
const subcontractActor = { uid: 'partner-admin', role: 'subcontract_admin', organizationId: 'partner' };
const draft = assignedOrganizationId => ({ assignedOrganizationId, customer: 'Customer', jobDate: '2026-10-24', driverId: '', vehiclePlate: '', pickupLocation: 'Origin', deliveryLocation: 'Destination', tripCount: 1, notes: '' });
(async () => {
  assert.equal(context.exports.canEditJob({ status: 'assigned', organizationId: 'partner' }, subcontractActor), false);
  await assert.rejects(context.exports.updateJobDetails({ id: 'job-1' }, draft('main'), subcontractActor), /เฉพาะแอดมินบริษัทหลัก/);
  await context.exports.updateJobDetails({ id: 'job-1' }, draft('partner'), actor);
  const subcontractJob = records.get('today_jobs/job-1');
  assert.equal(subcontractJob.status, 'pending_subcontract');
  assert.equal(subcontractJob.organizationId, 'partner');
  assert.equal(subcontractJob.carrierName, 'Partner Transport');
  assert.equal(subcontractJob.assignedDriverUid, undefined);
  assert.equal(subcontractJob.vehiclePlate, '');
  assert.equal(records.get('tracking_share_links/link-1').organizationId, 'partner');
  assert.equal(records.get('tracking_share_links/link-1').statusLabel, 'รอบริษัทซับรับงาน');

  await assert.rejects(context.exports.updateJobDetails({ id: 'job-1' }, draft('main'), actor), /เลือกพนักงานขับรถ/);
  await context.exports.updateJobDetails({ id: 'job-1' }, { ...draft('main'), driverId: 'new-driver', vehiclePlate: 'NEW' }, actor);
  assert.equal(records.get('today_jobs/job-1').status, 'assigned');
  assert.equal(records.get('today_jobs/job-1').assignedDriverUid, 'new-user');
  assert.equal(records.get('tracking_share_links/link-1').organizationId, 'main');

  records.set('today_jobs/job-1', { ...records.get('today_jobs/job-1'), status: 'to_pickup' });
  await assert.rejects(context.exports.updateJobDetails({ id: 'job-1' }, draft('partner'), actor), /เปลี่ยนบริษัทได้เฉพาะ/);
  console.log('PASS: company reassignment updates job and tracking link, requires driver, and blocks active jobs');
})().catch(error => { console.error(error); process.exitCode = 1; });
