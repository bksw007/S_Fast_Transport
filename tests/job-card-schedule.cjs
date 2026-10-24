const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/job-card-schedule.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {}, Date, Intl };
vm.runInNewContext(code, context);
const { driverJobCardTone, nextStopSchedule } = context.exports;
const today = '2026-10-14';
const job = { status: 'assigned', pickupDate: today, pickupTime: '09:30', deliveryDate: '2026-10-15', deliveryTime: '13:00' };

assert.equal(driverJobCardTone(job, today), 'today');
assert.equal(driverJobCardTone({ ...job, pickupDate: '2026-10-15' }, today), 'upcoming');
assert.equal(driverJobCardTone({ ...job, status: 'accepted', pickupDate: '2026-10-15' }, today), 'active');
assert.equal(driverJobCardTone({ ...job, status: 'to_delivery' }, today), 'active');
assert.equal(nextStopSchedule(job, today).label, 'รับสินค้า');
assert.equal(nextStopSchedule({ ...job, status: 'pending_subcontract' }, today).label, 'รับสินค้า');
assert.equal(nextStopSchedule({ ...job, status: 'subcontract_accepted' }, today).label, 'รับสินค้า');
assert.equal(nextStopSchedule(job, today).value, 'วันนี้ 09:30');
assert.equal(nextStopSchedule({ ...job, status: 'accepted', pickupDate: '2026-10-15', pickupTime: '' }, today).value, 'พรุ่งนี้');
assert.equal(nextStopSchedule({ ...job, pickupDate: '2026-10-16', pickupTime: '' }, today).value, 'อีก 2 วัน');
assert.equal(nextStopSchedule({ ...job, status: 'to_delivery' }, today).label, 'ส่งสินค้า');
assert.equal(nextStopSchedule({ ...job, status: 'to_delivery' }, today).value, 'พรุ่งนี้ 13:00');
assert.equal(nextStopSchedule({ ...job, status: 'problem', issuePreviousStatus: 'to_delivery' }, today).label, 'ส่งสินค้า');
assert.equal(nextStopSchedule({ ...job, status: 'accepted', activeLeg: 2, returnTrip: { pickupDate: '2026-10-16', pickupTime: '08:00', deliveryDate: '2026-10-16', deliveryTime: '11:00' } }, today).value, '16 ต.ค. 2569 08:00');
