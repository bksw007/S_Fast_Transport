const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let records, writes, roadRequests, roadError;
const firestore = {
  doc: (...parts) => { const path = parts.length === 1 ? `${parts[0]}/auto-job` : parts.slice(1).join('/'); return { id: path.split('/').at(-1), path }; }, collection: (_, ...parts) => parts.join('/'),
  getDoc: async ref => ({ exists: () => Boolean(records[ref.path]), data: () => records[ref.path] }),
  runTransaction: async (_db, operation) => operation({
    get: async ref => ({ exists: () => Boolean(records[ref.path]), data: () => records[ref.path] }),
    set: (ref, data) => { writes.push({ path: ref.path, data }); records[ref.path] = data; },
    update: (ref, data) => { writes.push({ path: ref.path, data }); records[ref.path] = { ...records[ref.path], ...data }; }
  }),
  serverTimestamp: () => 'SERVER_TIME'
};
const context = { exports: {}, require: name => {
  if (name === 'firebase/firestore') return firestore;
  if (name === './settings-repository') return { loadCompanySettings: async () => ({ name: 'Company' }) };
  if (name === './google-routes-distance') return { coordinateFingerprint: (from, to) => from && to && Number.isFinite(from.lat) && Number.isFinite(from.lng) && Number.isFinite(to.lat) && Number.isFinite(to.lng) ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : null };
  if (name === './job-road-distance-client') return { requestJobRoadDistance: async (...args) => { roadRequests.push(args); if (roadError) throw roadError; return 24567; } };
  return { db: {}, storage: {} };
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const actor = { uid: 'admin', organizationId: 'main', role: 'admin', active: true, approvalStatus: 'approved' };
const draft = { driverId: 'driver-b', driverName: 'Stale name', driverPhone: 'old', workOrder: 'WO-1' };
function reset() {
  writes = [];
  roadRequests = [];
  roadError = null;
  records = {
    'drivers/driver-a': { organizationId: 'main', userUid: 'user-a', name: 'Same name', phone: '111', status: 'available' },
    'drivers/driver-b': { organizationId: 'main', userUid: 'user-b', name: 'Same name', phone: '222', status: 'available' },
    'users/user-b': { organizationId: 'main', fullName: 'Same name', phone: '333', role: 'driver', active: true, approvalStatus: 'approved' }
  };
}
(async () => {
  assert.equal(context.exports.formatJobDateKey(new Date('2026-09-20T18:00:00.000Z')), '20260921', 'job dates use Bangkok time');
  reset(); const firstWorkOrder = await context.exports.createJob(draft, actor);
  const firstJob = writes.find(write => write.path.startsWith('today_jobs/'));
  assert.match(firstWorkOrder, /^JN-\d{8}001$/);
  assert.equal(firstJob.data.workOrder, firstWorkOrder);
  assert.equal(firstJob.data.assignedDriverUid, 'user-b');
  assert.equal(firstJob.data.driverId, 'driver-b');
  assert.equal(firstJob.data.driverName, 'Same name');
  assert.equal(firstJob.data.driverPhone, '333');
  const pickupPlace = { lat: 13.7563, lng: 100.5018 };
  const deliveryPlace = { lat: 13.65, lng: 100.65 };
  reset(); const calculatedOrder = await context.exports.createJob({ ...draft, pickupPlace, deliveryPlace }, actor);
  const calculatedJob = writes.find(write => write.path.startsWith('today_jobs/'));
  assert.equal(calculatedJob.data.workOrder, calculatedOrder);
  assert.deepEqual(roadRequests[0].slice(1), [pickupPlace, deliveryPlace]);
  assert.equal(records[calculatedJob.path].routeDistanceMeters, 24567, 'road distance is saved before creation returns');
  assert.equal(records[calculatedJob.path].routeDistanceProvider, 'google_routes');
  reset(); roadError = new Error('routing unavailable');
  const createdWithoutDistance = await context.exports.createJob({ ...draft, pickupPlace, deliveryPlace }, actor);
  assert.match(createdWithoutDistance, /^JN-\d{8}001$/, 'route failures do not discard a created job');
  assert.equal(records['today_jobs/auto-job'].routeDistanceMeters, undefined);
  reset(); await context.exports.createJob(draft, actor);
  assert.equal(roadRequests.length, 0, 'missing coordinates do not request a route');
  const secondWorkOrder = await context.exports.createJob(draft, actor);
  assert.equal(secondWorkOrder, `${firstWorkOrder.slice(0, -3)}002`, 'daily sequence increments atomically');
  reset(); records['users/user-b'].phone = ''; await context.exports.createJob(draft, actor);
  assert.equal(writes.find(write => write.path.startsWith('today_jobs/')).data.driverPhone, '222');
  reset(); records['drivers/driver-b'].userUid = 'admin'; records['users/admin'] = { organizationId: 'main', fullName: 'Admin Driver', role: 'admin', active: true, approvalStatus: 'approved' };
  await context.exports.createJob(draft, actor);
  assert.equal(writes.find(write => write.path.startsWith('today_jobs/')).data.assignedDriverUid, 'admin', 'an admin linked as a driver can receive their own job');
  const invalid = [
    () => delete records['drivers/driver-b'],
    () => { records['drivers/driver-b'].status = 'inactive'; },
    () => { records['drivers/driver-b'].organizationId = 'other'; },
    () => { records['drivers/driver-b'].userUid = ''; },
    () => delete records['users/user-b'],
    () => { records['users/user-b'].active = false; },
    () => { records['users/user-b'].approvalStatus = 'pending'; },
    () => { records['users/user-b'].role = 'unknown'; },
    () => { records['users/user-b'].organizationId = 'other'; }
  ];
  for (const change of invalid) {
    reset(); change(); await assert.rejects(() => context.exports.createJob(draft, actor)); assert.equal(writes.length, 0);
  }
  reset(); await assert.rejects(() => context.exports.createJob({ ...draft, driverId: '' }, actor)); assert.equal(writes.length, 0);
  console.log('PASS: daily job numbering, driver identity, automatic phone, fallback, and invalid assignment protection');
})().catch(error => { console.error(error); process.exitCode = 1; });
