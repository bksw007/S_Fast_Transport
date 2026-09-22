const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

let slots = [], cursor = 0, saved, removed = 0;
const stubComponent = name => {
  const component = props => React.createElement(name, props);
  component.displayName = name;
  return component;
};
const draftFromJob = job => ({
  customer: job.customer || '', jobDate: job.jobDate || '', cargoType: '', vehicleType: '', tripCount: '1', driverId: job.driverId || '', vehiclePlate: job.vehiclePlate || '',
  pickupLocation: job.pickupLocation || '', pickupDate: '', pickupTime: '', pickupContactId: '', pickupContact: '', pickupContactPhone: '', pickupContactNotes: '',
  deliveryLocation: job.deliveryLocation || '', deliveryDate: '', deliveryTime: '', deliveryContactId: '', deliveryContact: '', deliveryContactPhone: '', deliveryContactNotes: '', eta: '', notes: ''
});
const context = { exports: {}, require: name => {
  if (name === 'react') return {
    ...React,
    useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useEffect: () => {},
    useMemo: factory => factory()
  };
  if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => stubComponent(String(key)) });
  if (name === '@/lib/transport-repository') return { subscribeOrganizationUserProfiles: () => () => {} };
  if (name === '@/lib/resource-repository') return { subscribeDrivers: () => () => {} };
  if (name === '@/lib/profile-repository') return { formatPhoneNumber: value => value };
  if (name === '@/lib/job-edit') return { jobToEditDraft: draftFromJob };
  if (name === './ListManagerComboBox') return { ListManagerComboBox: stubComponent('list-manager') };
  if (name === './LocationPicker') return { LocationPicker: stubComponent('location-picker') };
  if (name === './ContactPicker') return stubComponent('contact-picker');
  if (name === '@s-fast-transport/shared') return {};
  return require(name);
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/app/components/JobEditor.tsx', 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, context);

const job = { id: 'job-1', workOrder: 'JN-20260921001', customer: 'ลูกค้า', jobDate: '2026-09-21', driverId: 'driver-1', driverName: 'คนขับ', driverPhone: '080', vehiclePlate: '70-0001', pickupLocation: 'รับ', deliveryLocation: 'ส่ง' };
const actor = { uid: 'admin', organizationId: 'main' };
let tree;
function render() { cursor = 0; tree = context.exports.default({ job, actor, busy: false, canDelete: true, onSave: async draft => { saved = draft; }, onDelete: async () => { removed++; } }); return tree; }
function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function find(predicate) { const item = nodes().find(predicate); assert.ok(item, 'Expected editor element'); return item; }

(async () => {
  render();
  assert.ok(nodes().some(node => node.type === 'h3' && node.props.children === 'แก้ไขรายละเอียดใบงาน'));
  assert.ok(nodes().some(node => node.props?.label === 'วันที่รับงานจากผู้ว่าจ้าง'));
  assert.equal(nodes().filter(node => node.type?.displayName === 'location-picker').length, 2);
  assert.equal(nodes().filter(node => node.type?.displayName === 'contact-picker').length, 2);
  find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.driverId, 'driver-1');
  find(node => node.props?.className === 'danger-outline').props.onClick();
  render();
  const confirm = find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('ยืนยันลบ'));
  confirm.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removed, 1);
  console.log('PASS: complete job editor and two-step admin delete confirmation');
})().catch(error => { console.error(error); process.exitCode = 1; });
