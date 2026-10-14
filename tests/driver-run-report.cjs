const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const shared = { exports: {}, Date, Intl };
vm.runInNewContext(compile(fs.readFileSync('packages/shared/src/index.ts', 'utf8')), shared);
const context = { exports: {}, Date, Intl, require: name => name === '@s-fast-transport/shared' ? shared.exports : require(name) };
vm.runInNewContext(compile(fs.readFileSync('apps/web/lib/driver-run-report.ts', 'utf8')), context);
const { driverRunReportRows, driverRunOtherExpenses, driverRunReportSummary, driverRunExpenseLabel, driverRunPickupDate, driverRunReportHtml } = context.exports;

const base = { status: 'completed', assignedDriverUid: 'driver-1', vehicleType: 'รถ 6 ล้อ', vehiclePlate: '72-2211', customer: 'ลูกค้า A', pickupLocation: 'ต้นทาง', deliveryLocation: 'ปลายทาง' };
const jobs = [
  { ...base, id: 'a', workOrder: 'JN-A', completedAt: '2026-10-14T03:00:00Z' },
  { ...base, id: 'b', workOrder: 'JN-B', vehicleType: 'รถ 4 ล้อ', completedAt: '2026-10-13T03:00:00Z' },
  { ...base, id: 'c', workOrder: 'JN-C', completedAt: '2026-09-13T03:00:00Z' },
  { ...base, id: 'd', workOrder: 'JN-D', assignedDriverUid: 'driver-2', completedAt: '2026-10-12T03:00:00Z' },
  { ...base, id: 'e', workOrder: 'JN-E', status: 'cancelled', completedAt: '2026-10-11T03:00:00Z' },
  { ...base, id: 'f', workOrder: 'JN-F', vehicleType: '', completedAt: '2026-10-10T03:00:00Z' }
];
const expenses = [
  { jobId: 'a', driverUid: 'driver-1', amount: 100, status: 'approved' },
  { jobId: 'b', driverUid: 'driver-1', amount: 50, status: 'pending' },
  { jobId: 'f', driverUid: 'driver-1', amount: 25, status: 'rejected' },
  { jobId: 'd', driverUid: 'driver-2', amount: 999, status: 'approved' },
  { id: 'other-1', jobId: 'other-1', driverUid: 'driver-1', expenseKind: 'other', category: 'repair', completedMonth: '2026-10', expenseDate: '2026-10-12', vehiclePlate: '72-2211', note: '<script>test</script>', amount: 75, status: 'approved', createdAt: '2026-10-12T03:00:00Z' },
  { id: 'other-2', jobId: 'other-2', driverUid: 'driver-1', expenseKind: 'other', category: 'wash', completedMonth: '2026-10', expenseDate: '2026-10-13', vehiclePlate: '', note: 'ล้างรถ', amount: 40, status: 'pending', createdAt: '2026-10-13T03:00:00Z' },
  { id: 'other-3', jobId: 'other-3', driverUid: 'driver-2', expenseKind: 'other', category: 'equipment', completedMonth: '2026-10', expenseDate: '2026-10-14', vehiclePlate: '', note: '', amount: 500, status: 'pending', createdAt: '2026-10-14T03:00:00Z' }
];
const october = driverRunReportRows(jobs, expenses, 'driver-1', '2026-10', '');
assert.deepEqual(Array.from(october, row => row.job.id), ['a', 'b', 'f']);
assert.deepEqual(Array.from(driverRunReportRows(jobs, expenses, 'driver-1', '2026-10', 'รถ 6 ล้อ'), row => row.job.id), ['a']);
assert.deepEqual(Array.from(driverRunReportRows(jobs, expenses, 'driver-1', '2026-10', 'ไม่ระบุประเภทรถ'), row => row.job.id), ['f']);
assert.deepEqual(Array.from(driverRunReportRows(jobs, expenses, 'driver-1', '2026-09', ''), row => row.job.id), ['c']);
assert.equal(driverRunReportSummary(october).jobs, 3);
assert.equal(driverRunReportSummary(october).claimed, 175);
assert.equal(driverRunReportSummary(october).approved, 100);
assert.equal(driverRunReportSummary(october).pending, 50);
const octoberOther = driverRunOtherExpenses(expenses, 'driver-1', '2026-10');
assert.deepEqual(Array.from(octoberOther, expense => expense.id), ['other-1', 'other-2']);
assert.deepEqual(Array.from(driverRunOtherExpenses(expenses, 'driver-1', '2026-09'), expense => expense.id), []);
assert.equal(driverRunReportSummary(october, octoberOther).jobs, 3);
assert.equal(driverRunReportSummary(october, octoberOther).claimed, 290);
assert.equal(driverRunReportSummary(october, octoberOther).approved, 175);
assert.equal(driverRunReportSummary(october, octoberOther).pending, 90);
assert.equal(driverRunExpenseLabel(), 'ยังไม่แจ้งค่าใช้จ่าย');
assert.equal(driverRunExpenseLabel({ status: 'paid' }), 'อนุมัติแล้ว');
assert.equal(driverRunExpenseLabel({ status: 'rejected' }), 'ไม่อนุมัติ');
assert.equal(driverRunPickupDate('2026-10-14'), '14 ต.ค. 2569');
assert.equal(driverRunPickupDate(''), 'ไม่ระบุวันที่');
assert.equal(driverRunPickupDate('2026-02-30'), 'ไม่ระบุวันที่');
const html = driverRunReportHtml([{ job: { ...jobs[0], pickupDate: '2026-10-14', customer: '<script>alert(1)</script>' }, expense: expenses[0] }], { name: 'นายคนขับ', photoURL: 'https://example.com/profile.jpg' }, 'ตุลาคม 2569', 'รถ 6 ล้อ', new Date('2026-10-14T00:00:00Z'));
assert.ok(html.includes('JN-A'));
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(html.includes('data-label="ค่าใช้จ่าย"'));
assert.ok(html.includes('data-label="วันที่งาน">14 ต.ค. 2569'));
assert.ok(!html.includes('data-label="จบงาน"'));
assert.ok(html.includes('class="avatar"'));
assert.ok(html.includes('https://example.com/profile.jpg'));
assert.ok(html.includes('@page{size:A4 portrait'));
assert.ok(html.indexOf('class="footnote"') < html.indexOf('<table>'), 'report note stays with the summary, not on an extra last page');
assert.ok(html.includes('@media print'));
assert.ok(!html.includes('JN-B'), 'PDF follows the selected rows');
const htmlWithOther = driverRunReportHtml([{ job: { ...jobs[0], pickupDate: '2026-10-14' }, expense: expenses[0] }], { name: 'นายคนขับ' }, 'ตุลาคม 2569', '', new Date('2026-10-14T00:00:00Z'), octoberOther);
assert.ok(htmlWithOther.indexOf('JN-A') < htmlWithOther.indexOf('ค่าใช้จ่ายอื่น (2 รายการ)'), 'standalone expenses follow completed jobs');
assert.ok(htmlWithOther.includes('ค่าซ่อมรถ'));
assert.ok(htmlWithOther.includes('ค่าล้างรถ'));
assert.ok(htmlWithOther.includes('&lt;script&gt;test&lt;/script&gt;'));
assert.ok(!htmlWithOther.includes('<script>test</script>'));
assert.ok(htmlWithOther.includes('฿215.00'), 'report total includes standalone expenses');
const onlyOtherHtml = driverRunReportHtml([], { name: 'นายคนขับ' }, 'ตุลาคม 2569', '', new Date('2026-10-14T00:00:00Z'), octoberOther);
assert.ok(onlyOtherHtml.includes('ค่าใช้จ่ายอื่น (2 รายการ)'), 'report can contain standalone expenses without completed jobs');
assert.ok(onlyOtherHtml.includes('฿115.00'));

const unsortedRows = [
  { job: { ...base, id: 'late', workOrder: 'JN-LATE', pickupDate: '2026-10-20' } },
  { job: { ...base, id: 'missing', workOrder: 'JN-MISSING', pickupDate: '' } },
  { job: { ...base, id: 'early-b', workOrder: 'JN-EARLY-B', pickupDate: '2026-10-02' } },
  { job: { ...base, id: 'early-a', workOrder: 'JN-EARLY-A', pickupDate: '2026-10-02' } }
];
const orderedHtml = driverRunReportHtml(unsortedRows, { name: 'คนขับ' }, 'ตุลาคม 2569', '');
assert.ok(orderedHtml.indexOf('JN-EARLY-A') < orderedHtml.indexOf('JN-EARLY-B'));
assert.ok(orderedHtml.indexOf('JN-EARLY-B') < orderedHtml.indexOf('JN-LATE'));
assert.ok(orderedHtml.indexOf('JN-LATE') < orderedHtml.indexOf('JN-MISSING'));
assert.equal(unsortedRows[0].job.workOrder, 'JN-LATE', 'PDF sorting must not change the screen order');
