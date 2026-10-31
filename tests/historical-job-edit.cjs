const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/historical-job.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const writes = [];
const uploaded = [];
const deleted = [];
let syncedLink;
const current = { historical: true, status: 'completed', organizationId: 'main', workOrder: 'JN-20261010001PE', pickupDate: '2026-10-10', historicalEvidence: { pickup: [], delivery: [], document: [], expense: [] } };
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
  'firebase/storage': { ref: (_storage, path) => path, uploadBytes: async path => { uploaded.push(path); }, deleteObject: async path => { deleted.push(path); } },
  './firebase': { db: {}, storage: {} },
  './image-upload': { isImageFile: () => true, compressImageForUpload: async file => file, MAX_SOURCE_IMAGE_BYTES: 20_000_000 },
  './customer-repository': { resolveCustomerId: async () => 'customer-1' },
  './transport-repository': { hasApprovedAccess: () => true, isMainAdmin: () => true },
  './historical-work-order': {},
  './google-routes-distance': { coordinateFingerprint: place => place ? `${place.lat},${place.lng}` : '' },
  './settings-repository': { loadCompanySettings: async () => ({ name: 'S Fast Transport' }) },
  './job-detail-repository': { syncEditedShareLinks: async (_jobId, values) => { syncedLink = values; } }
};
const context = { exports: {}, require: name => mocks[name] ?? {}, Intl, Date, Number, String, Error, crypto: { randomUUID: () => `photo-${uploaded.length + 1}` } };
vm.runInNewContext(code, context);

const job = { id: 'job-1', historical: true, workOrder: current.workOrder, pickupDate: current.pickupDate };
const draft = {
  submissionId: job.id, customer: 'Customer', carrierOrganizationId: 'main', driverId: 'driver-1', vehiclePlate: 'ABC-123',
  vehicleType: 'Truck', cargoType: 'Parts', tripCount: '1', pickupDate: current.pickupDate, pickupTime: '09:00',
  pickupLocation: 'Bangkok', deliveryDate: '2026-10-10', deliveryTime: '12:00', deliveryLocation: 'Rayong',
  arrivedPickupAt: '2026-10-10T09:15', arrivedDeliveryAt: '2026-10-10T13:00', notes: 'Corrected'
};

(async () => {
  await context.exports.updateHistoricalJob(job, draft, { uid: 'admin', organizationId: 'main' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].jobDate, draft.pickupDate);
  assert.equal(writes[0].driverName, 'Driver');
  assert.equal(writes[0].arrivedPickupAt.toISOString(), new Date('2026-10-10T09:15:00+07:00').toISOString());
  assert.equal(writes[0].arrivedDeliveryAt.toISOString(), writes[0].completedAt.toISOString());
  assert.ok(!('workOrder' in writes[0]));
  assert.ok(!('pickupDate' in writes[0]));
  assert.ok(!('historicalEvidence' in writes[0]));
  assert.equal(syncedLink.carrierName, 'S Fast Transport');
  assert.equal(syncedLink.lastUpdatedAt, new Date('2026-10-10T13:00:00+07:00').toISOString());
  await assert.rejects(context.exports.updateHistoricalJob(job, { ...draft, pickupDate: '2026-10-11' }, { uid: 'admin', organizationId: 'main' }), /วันที่รับสินค้า/);
  await assert.rejects(context.exports.updateHistoricalJob(job, { ...draft, arrivedPickupAt: '2026-10-10T14:00' }, { uid: 'admin', organizationId: 'main' }), /ไม่สอดคล้อง/);
  assert.equal(writes.length, 1);
  const emptyPhotos = { pickup: [], delivery: [], document: [], expense: [] };
  assert.doesNotThrow(() => context.exports.validateHistoricalJob(draft, emptyPhotos), 'historical jobs can be created before photos are available');
  const photo = { name: 'proof.jpg', type: 'image/jpeg', size: 100 };
  await context.exports.appendHistoricalPhotos(job, { ...emptyPhotos, pickup: [photo], document: [photo] }, { uid: 'admin', organizationId: 'main' });
  assert.equal(writes[1].historicalEvidence.pickup.length, 1);
  assert.equal(writes[1].historicalEvidence.document.length, 1);
  assert.equal(writes[1].historicalEvidence.delivery.length, 0);
  assert.ok(!('workOrder' in writes[1]));
  current.historicalEvidence.pickup = Array.from({ length: 10 }, (_, index) => `existing-${index}`);
  await assert.rejects(context.exports.appendHistoricalPhotos(job, { ...emptyPhotos, pickup: [photo] }, { uid: 'admin', organizationId: 'main' }), /เกิน 10 รูป/);
  assert.equal(writes.length, 2);
  assert.equal(deleted.length, 1, 'failed append cleans up newly uploaded files');
  const previousCompletion = { toDate: () => new Date('2026-10-10T14:00:00+07:00') };
  current.arrivedDeliveryAt = { toDate: () => new Date('2026-10-10T13:00:00+07:00') };
  current.completedAt = previousCompletion;
  await context.exports.updateHistoricalJob(job, draft, { uid: 'admin', organizationId: 'main' });
  assert.equal(writes[2].completedAt, previousCompletion, 'editing other fields preserves an older close time');
  await context.exports.updateHistoricalJob(job, { ...draft, arrivedDeliveryAt: '2026-10-10T15:00' }, { uid: 'admin', organizationId: 'main' });
  assert.equal(writes[3].completedAt.toISOString(), new Date('2026-10-10T15:00:00+07:00').toISOString());
  console.log('PASS: historical jobs allow empty photos and later appends without replacing existing evidence');
})().catch(error => { console.error(error); process.exitCode = 1; });
