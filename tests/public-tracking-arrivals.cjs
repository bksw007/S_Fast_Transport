const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.createSourceFile('page.tsx', fs.readFileSync('apps/web/app/track/[token]/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['thaiDateTime', 'thaiDate', 'scheduledArrival', 'arrivalBadge']);
const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(source)).join('\n');
const code = ts.transpileModule(`${functions}\nexports.arrivalBadge = arrivalBadge;`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, Date, Number };
vm.runInNewContext(code, context);

const job = { status: 'completed', historical: false, jobDate: '2026-10-31', pickupDate: '2026-10-30', pickupTime: '', deliveryDate: '2026-10-30', deliveryTime: '', arrivedPickupAt: '', arrivedDeliveryAt: '', completedAt: '2026-10-30T09:18:00Z', eta: 'วันนี้' };
const pickup = context.exports.arrivalBadge(job, 'pickup');
const delivery = context.exports.arrivalBadge(job, 'delivery');
assert.equal(pickup.label, 'ถึงจุดรับสินค้า');
assert.equal(delivery.label, 'ถึงจุดส่งสินค้า');
assert.match(pickup.value, /30 ต\.ค\. 2569/);
assert.match(delivery.value, /30 ต\.ค\. 2569/);
assert.doesNotMatch(`${pickup.value} ${delivery.value}`, /วันนี้|น\.$/);

const actual = context.exports.arrivalBadge({ ...job, arrivedPickupAt: '2026-10-30T08:48:00Z', arrivedDeliveryAt: '2026-10-30T09:17:00Z' }, 'pickup');
assert.match(actual.value, /30 ต\.ค\. 2569 15:48 น\./);
const historical = context.exports.arrivalBadge({ ...job, historical: true, arrivedPickupAt: '2026-10-30' }, 'pickup');
assert.match(historical.value, /30 ต\.ค\. 2569/);
assert.doesNotMatch(historical.value, /น\./);
assert.match(context.exports.arrivalBadge({ ...job, historical: true }, 'delivery').value, /30 ต\.ค\. 2569/);

const active = { ...job, status: 'to_delivery' };
assert.match(context.exports.arrivalBadge(active, 'delivery').value, /30 ต\.ค\. 2569/);
assert.doesNotMatch(context.exports.arrivalBadge(active, 'delivery').value, /วันนี้/);
assert.match(context.exports.arrivalBadge({ ...active, deliveryTime: '12:00' }, 'delivery').value, /30 ต\.ค\. 2569 12:00 น\./);
console.log('PASS: share-link arrival badges show actual times or job dates without stale relative ETA');
