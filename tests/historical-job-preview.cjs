const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

let slots = [], cursor = 0, created = 0, scrolled = 0, effects = [];
const draft = {
  submissionId: 'draft-1', customer: 'Customer', carrierOrganizationId: 'main', driverId: 'driver-1', vehiclePlate: 'ABC-123',
  vehicleType: 'Truck', cargoType: 'Parts', tripCount: '1', pickupDate: '2026-10-10', pickupTime: '09:00', pickupLocation: 'Bangkok',
  deliveryDate: '2026-10-10', deliveryTime: '12:00', deliveryLocation: 'Rayong', arrivedPickupAt: '2026-10-10T09:15',
  arrivedDeliveryAt: '2026-10-10T13:00', notes: ''
};
const hooks = {
  ...React,
  useRef: () => ({ current: { scrollIntoView: () => { scrolled++; } } }),
  useEffect: callback => { effects.push(callback); },
  useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  }
};
const mocks = {
  react: hooks,
  'lucide-react': { FilePlus2: () => null, X: () => null },
  './ListManagerComboBox': { ListManagerComboBox: () => null },
  './LocationPicker': { LocationPicker: () => null },
  '@/lib/historical-job': {
    historicalPhotoCategories: ['pickup', 'delivery', 'document', 'expense'],
    validateHistoricalJob: input => { assert.equal(input.arrivedDeliveryAt, draft.arrivedDeliveryAt); },
    createHistoricalJob: async () => { created++; return 'JN-20261010001PE'; }
  },
  '@/lib/image-upload': { isImageFile: () => true, MAX_SOURCE_IMAGE_BYTES: 20_000_000 },
  '@/lib/resource-repository': { subscribeDrivers: () => () => {}, subscribeSubcontractOrganizations: () => () => {} },
  './historical-job.css': {}
};
const context = { exports: {}, require: name => mocks[name] ?? {}, React, Intl, Date, crypto: { randomUUID: () => 'draft-2' } };
const source = fs.readFileSync('apps/web/app/components/HistoricalJobScreen.tsx', 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, context);
function render() { cursor = 0; effects = []; const tree = context.exports.default({ actor: { organizationName: 'S Fast Transport' } }); effects[0](); return tree; }
function nodes(node) { return node && typeof node === 'object' ? [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)] : []; }
function find(tree, predicate) { const node = nodes(tree).find(predicate); assert.ok(node); return node; }

(async () => {
  slots[0] = draft;
  slots[4] = { organizationId: 'main', items: [{ id: 'driver-1', name: 'Driver' }], error: '' };
  let tree = render();
  find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(created, 0, 'review does not create a job');
  tree = render();
  assert.ok(find(tree, node => node.type === 'dialog'));
  find(tree, node => node.type === 'button' && node.props.children === 'กลับไปแก้ไข').props.onClick();
  assert.equal(created, 0, 'returning to the form does not create a job');
  tree = render();
  assert.equal(nodes(tree).some(node => node.type === 'dialog'), false);
  find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = render();
  find(tree, node => node.type === 'button' && node.props.children === 'ยืนยันบันทึกใบงาน').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  render();
  assert.equal(created, 1);
  assert.equal(scrolled, 1, 'successful save returns to the top');
  assert.equal(slots[9], false, 'preview closes after saving');
  console.log('PASS: historical job preview requires confirmation and scrolls to the top after saving');
})().catch(error => { console.error(error); process.exitCode = 1; });
