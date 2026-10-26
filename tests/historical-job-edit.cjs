const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/historical-job.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const writes = [];
const current = { historical: true, status: 'completed', workOrder: 'JN-20261010001PE', pickupDate: '2026-10-10' };
const firestore = {
  collection: (_db, path) => ({ path }),
  doc: (parent, path, id) => ({ path: id ? `${path}/${id}` : `${parent.path}/${path}` }),
  deleteField: () => 'DELETE_FIELD',
  getDoc: async ref => ({ data: () => ref.path === 'drivers/driver-1' ? { organizationId: 'main', name: 'Driver', phone: '0123456789' } : undefined }),
  runTransaction: async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => current }),
    update: (_ref, value) => writes.push(value),
    set: () => {}
  }),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  Timestamp: { fromDate: date => date }
};
const mocks = {
  'firebase/firestore': firestore,
  'firebase/storage': {},
  './firebase': { db: {}, storage: {} },
  './image-upload': { isImageFile: () => true, MAX_SOURCE_IMAGE_BYTES: 20_000_000 },
  './customer-repository': { resolveCustomerId: async () => 'customer-1' },
  './transport-repository': { hasApprovedAccess: () => true, isMainAdmin: () => true },
  './historical-work-order': {},
  './google-routes-distance': { coordinateFingerprint: place => place ? `${place.lat},${place.lng}` : '' },
  './settings-repository': { loadCompanySettings: async () => ({ name: 'S Fast Transport' }) }
};
const context = { exports: {}, require: name => mocks[name] ?? {}, Intl, Date, Number, String, Error };
vm.runInNewContext(code, context);

const job = { id: 'job-1', historical: true, workOrder: current.workOrder, pickupDate: current.pickupDate };
const draft = {
  submissionId: job.id, customer: 'Customer', carrierOrganizationId: 'main', driverId: 'driver-1', vehiclePlate: 'ABC-123',
  vehicleType: 'Truck', cargoType: 'Parts', tripCount: '1', pickupDate: current.pickupDate, pickupTime: '09:00',
  pickupLocation: 'Bangkok', deliveryDate: '2026-10-10', deliveryTime: '12:00', deliveryLocation: 'Rayong',
  arrivedDeliveryAt: '2026-10-10T12:00', completedAt: '2026-10-10T13:00', notes: 'Corrected'
};

(async () => {
  await context.exports.updateHistoricalJob(job, draft, { uid: 'admin', organizationId: 'main' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].jobDate, draft.pickupDate);
  assert.equal(writes[0].driverName, 'Driver');
  assert.ok(!('workOrder' in writes[0]));
  assert.ok(!('pickupDate' in writes[0]));
  assert.ok(!('historicalEvidence' in writes[0]));
  await assert.rejects(context.exports.updateHistoricalJob(job, { ...draft, pickupDate: '2026-10-11' }, { uid: 'admin', organizationId: 'main' }), /วันที่รับสินค้า/);
  assert.equal(writes.length, 1);
  console.log('PASS: historical edits preserve the work order, pickup date, and evidence');
})().catch(error => { console.error(error); process.exitCode = 1; });
