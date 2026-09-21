const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/job-edit.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, context);

const place = { name: 'คลัง A', originalMapsUrl: 'https://maps.google.com/a', navigationUrl: 'https://www.google.com/maps/dir/?api=1', lat: 13.7, lng: 100.5 };
const job = {
  customer: ' ลูกค้า A ', jobDate: '2026-09-21', cargoType: 'อาหาร', vehicleType: '6 ล้อ', tripCount: 2,
  driverId: 'driver-1', driverName: 'นายทดสอบ', driverPhone: '080-000-0000', vehiclePlate: '70-0001 กรุงเทพ',
  pickupLocation: 'คลัง A', pickupPlace: place, pickupDate: '2026-09-21', pickupTime: '09:00',
  pickupContactId: 'contact-1', pickupContact: 'คุณเอ', pickupContactPhone: '081-111-1111', pickupContactNotes: '',
  deliveryLocation: 'โรงงาน B', deliveryDate: '2026-09-21', deliveryTime: '14:00',
  deliveryContactId: '', deliveryContact: 'คุณบี', deliveryContactPhone: '082-222-2222', deliveryContactNotes: '',
  eta: '14:00', notes: ' ระวังสินค้าแตก '
};

const draft = context.exports.jobToEditDraft(job);
assert.equal(draft.tripCount, '2');
assert.equal(draft.driverId, 'driver-1');
assert.equal(draft.pickupPlace.lat, 13.7);

const clean = context.exports.validateJobEditDraft(draft);
assert.equal(clean.customer, 'ลูกค้า A');
assert.equal(clean.notes, 'ระวังสินค้าแตก');
assert.equal(clean.tripCount, 2);

assert.throws(() => context.exports.validateJobEditDraft({ ...draft, customer: ' ' }), /บริษัทผู้ว่าจ้าง/);
assert.throws(() => context.exports.validateJobEditDraft({ ...draft, tripCount: '0' }), /จำนวนรอบ/);
assert.throws(() => context.exports.validateJobEditDraft({ ...draft, pickupContact: '', pickupContactPhone: '0811111111' }), /ผู้ติดต่อจุดรับ/);
assert.throws(() => context.exports.validateJobEditDraft({ ...draft, deliveryDate: '21\/09\/2026' }), /วันที่ส่ง/);
const repositorySource = fs.readFileSync('apps/web/lib/job-detail-repository.ts', 'utf8');
const transportSource = fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8');
assert.match(repositorySource, /routeDistanceMeters:\s*deleteField\(\)/, 'location changes invalidate cached road distance');
assert.match(repositorySource, /deletedAt:\s*serverTimestamp\(\)/, 'delete action is recoverable');
assert.match(repositorySource, /tracking_share_links[\s\S]*enabled:\s*false/, 'delete action disables public links');
assert.match(transportSource, /filter\(\(jobDoc\) => !jobDoc\.data\(\)\.deletedAt\)/, 'soft-deleted jobs are hidden');
console.log('PASS: job edit draft conversion and validation');
