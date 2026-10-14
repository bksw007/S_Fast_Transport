const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/driver-expense-report.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, Intl, Date };
vm.runInNewContext(code, context);
const { expenseReportRows, expenseReportSummary, driverExpenseReportHtml } = context.exports;

const claims = [
  { id: '1', jobId: 'job-1', workOrder: 'JN-1', driverUid: 'driver-1', driverName: 'สมชาย', completedMonth: '2026-10', amount: 120, note: '<script>alert(1)</script>', status: 'pending' },
  { id: '2', jobId: 'job-2', workOrder: 'JN-2', driverUid: 'driver-1', driverName: 'สมชาย', completedMonth: '2026-10', amount: 80, note: 'ค่าทางด่วน', status: 'approved' },
  { id: '3', jobId: 'job-3', workOrder: 'JN-3', driverUid: 'driver-2', driverName: 'สมหญิง', completedMonth: '2026-10', amount: 50, note: '', status: 'paid' },
  { id: '4', jobId: 'job-4', workOrder: 'JN-4', driverUid: 'driver-1', driverName: 'สมชาย', completedMonth: '2026-09', amount: 999, note: '', status: 'rejected' },
  { id: '5', jobId: 'other-test', workOrder: 'ค่าใช้จ่ายอื่น', driverUid: 'driver-1', driverName: 'สมชาย', completedMonth: '2026-10', expenseKind: 'other', category: 'repair', expenseDate: '2026-10-14', vehiclePlate: 'ขค 4321', amount: 350, note: 'เปลี่ยนอะไหล่', status: 'pending' }
];
const jobs = [{ id: 'job-1', vehiclePlate: 'กข 1234' }, { id: 'job-2', vehiclePlate: 'คง 5678' }, { id: 'job-3', vehiclePlate: 'กข 1234' }];
const october = expenseReportRows(claims, jobs, '2026-10');
assert.deepEqual(Array.from(october, row => row.claim.id), ['1', '2', '3', '5']);
assert.deepEqual(Array.from(expenseReportRows(claims, jobs, '2026-10', 'driver-1', 'กข 1234'), row => row.claim.id), ['1']);
assert.deepEqual(Array.from(expenseReportRows(claims, jobs, '2026-10', 'driver-1', 'ขค 4321'), row => row.claim.id), ['5']);
const summary = expenseReportSummary(october);
assert.equal(summary.total, 600);
assert.equal(summary.approvedTotal, 130);
assert.equal(summary.counts.pending, 2);
assert.equal(summary.counts.approved, 2, 'historical paid claims are counted as approved');
const html = driverExpenseReportHtml(october, 'ตุลาคม 2026', 'ทุกคนขับ', 'ทุกรถ', new Date('2026-10-14T00:00:00Z'));
assert.ok(html.includes('JN-1'));
assert.ok(html.includes('กข 1234'));
assert.ok(html.includes('ค่าซ่อมรถ'));
assert.ok(html.includes('ขค 4321'));
assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(!html.includes('JN-4'), 'PDF includes only the filtered month');
assert.ok(!html.includes('จ่ายแล้ว'), 'PDF uses only the approved status');
assert.equal((html.match(/อนุมัติแล้ว/g) || []).length >= 2, true);
assert.ok(html.includes('name="viewport"'), 'preview starts with a mobile viewport');
assert.ok(html.includes('screen and (max-device-width:700px)'), 'mobile browser preview gets a readable layout');
assert.ok(html.includes('@media print'), 'paper output keeps its own layout');
assert.ok(html.includes('data-label="คนขับ"'), 'mobile report rows identify their values');
const component = fs.readFileSync('apps/web/app/components/DriverExpenses.tsx', 'utf8');
const rules = fs.readFileSync('firebase/firestore.rules', 'utf8');
assert.ok(!component.includes('ทำเครื่องหมายว่าจ่ายแล้ว'));
assert.ok(!rules.includes('request.resource.data.status == "paid"'), 'rules cannot transition a claim to paid');
