const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const shared = { exports: {}, Date, Intl };
vm.runInNewContext(compile(fs.readFileSync('packages/shared/src/index.ts', 'utf8')), shared);
const context = { exports: {}, Date, Intl, require: name => name === '@s-fast-transport/shared' ? shared.exports : require(name) };
vm.runInNewContext(compile(fs.readFileSync('apps/web/lib/customer-monthly-report.ts', 'utf8')), context);
const { customerMonthlyJobs, customerMonthlyReportHtml } = context.exports;

const base = { status: 'completed', customerId: 'customer-a', pickupLocation: 'จุดรับ', deliveryLocation: 'จุดส่ง', vehicleType: 'รถ 6 ล้อ', vehiclePlate: '72-2211' };
const jobs = [
  { ...base, id: 'a', workOrder: 'JN-A', completedAt: '2026-10-14T05:00:00Z', pickupDate: '2026-10-13', pickupTime: '09:00' },
  { ...base, id: 'b', workOrder: 'JN-B', completedAt: '2026-09-30T18:00:00Z', pickupDate: '2026-09-30' },
  { ...base, id: 'c', workOrder: 'JN-C', customerId: 'customer-b', completedAt: '2026-10-14T06:00:00Z' },
  { ...base, id: 'd', workOrder: 'JN-D', status: 'assigned', completedAt: '2026-10-14T07:00:00Z' },
  { ...base, id: 'e', workOrder: 'JN-E', completedAt: '2026-09-15T07:00:00Z' },
];
const october = customerMonthlyJobs(jobs, 'customer-a', '2026-10');
assert.deepEqual(Array.from(october, job => job.id), ['a', 'b'], 'completion month uses Bangkok time and stays inside customer');
assert.deepEqual(Array.from(customerMonthlyJobs(jobs, 'customer-a', '2026-09'), job => job.id), ['e']);
const html = customerMonthlyReportHtml(october, 'บริษัท <ทดสอบ>', '2026-10', new Date('2026-10-15T00:00:00Z'));
assert.ok(html.includes('JN-A'));
assert.ok(html.includes('JN-B'));
assert.ok(!html.includes('JN-C'));
assert.ok(html.includes('บริษัท &lt;ทดสอบ&gt;'));
assert.ok(html.includes('พิมพ์ / บันทึกเป็น PDF'));
assert.ok(html.includes('@page'));
assert.ok(html.indexOf('JN-B') < html.indexOf('JN-A'), 'PDF lists earliest completed jobs first');
assert.equal(october[0].id, 'a', 'PDF sorting does not mutate screen data');
console.log('customer monthly report passed');
