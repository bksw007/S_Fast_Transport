const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const fileName = 'apps/mobile/src/driver-workflow.ts';
const output = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const context = { exports: {}, require: () => ({}) };
vm.runInNewContext(output, context);

const { currentDriverStep, driverProgress, driverSteps } = context.exports;
const expected = {
  assigned: 'accepted', accepted: 'arrived_pickup', to_pickup: 'arrived_pickup',
  arrived_pickup: 'loading', loading: 'to_delivery', to_delivery: 'arrived_delivery',
  arrived_delivery: 'ready_to_close', unloading: 'ready_to_close', ready_to_close: 'completed'
};

for (const [status, nextStatus] of Object.entries(expected)) {
  assert.equal(currentDriverStep({ status }).nextStatus, nextStatus, `${status} exposes only its next step`);
}
assert.equal(currentDriverStep({ status: 'completed' }), null);
assert.equal(currentDriverStep({ status: 'cancelled' }), null);
assert.equal(currentDriverStep({ status: 'problem', issuePreviousStatus: 'to_delivery' }).nextStatus, 'arrived_delivery');
assert.equal(currentDriverStep({ status: 'problem' }), null);
assert.equal(currentDriverStep({ status: 'accepted' }).photoStage, 'pickup');
assert.equal(currentDriverStep({ status: 'to_delivery' }).photoStage, 'delivery');
assert.equal(driverProgress({ status: 'assigned' }), 0);
assert.equal(driverProgress({ status: 'completed' }), driverSteps.length);
assert.equal(driverSteps.filter(step => step.photoStage).length, 2);

console.log('PASS: mobile driver sees one gated next step with required pickup and delivery photos');
