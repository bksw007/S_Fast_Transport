const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
let slots = [], cursor = 0, saved, uploaded, links = 0, copied;
const repository = {
  createTrackingShareLink: async () => { links++; return 'job-token'; },
  uploadProof: async (...args) => { uploaded = args; }
};
const detailRepository = {
  saveJobSettings: async (...args) => { saved = args; },
  recordTime: () => 0,
  subscribeJobRecords: () => () => {}
};
const context = { exports: {}, window: { location: { origin: 'https://example.test' } }, navigator: { clipboard: { writeText: async value => { copied = value; } } }, require: name => {
  if (name === 'react') return { ...React, useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; }, useEffect: () => {} };
  if (name === '@/lib/transport-repository') return repository;
  if (name === '@/lib/job-detail-repository') return detailRepository;
  if (name === '@s-fast-transport/shared') return { statusLabels: { assigned: 'มอบหมายแล้ว' } };
  if (name === 'next/image') return 'img';
  return require(name);
}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/app/components/JobDetail.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
const job = { id: 'job-a', workOrder: 'WO-A', status: 'assigned', driverPhone: '012', eta: '15:00', notes: 'Original', currentLocation: { lat: 13, lng: 100, updatedAt: '' } };
const actor = { uid: 'admin' };
let tree;
function render(canWrite = true) { cursor = 0; tree = context.exports.default({ job, actor, canWrite, map: React.createElement('div', null, 'MAP') }); return tree; }
function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function find(predicate) { const result = nodes().find(predicate); assert.ok(result, 'Expected UI element'); return result; }
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  render();
  assert.equal(find(n => n.props?.role === 'tab' && n.props['aria-selected']).props.children, 'รายละเอียดงาน');
  for (let i = 0; i < 5; i++) { find(n => n.props?.id === `job-tab-${i}`).props.onClick(); render(); assert.equal(find(n => n.props?.role === 'tabpanel').props['aria-labelledby'], `job-tab-${i}`); }
  find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes(' Share')).props.onClick(); await flush(); render();
  assert.equal(copied, 'https://example.test/track/job-token');
  find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes(' QR')).props.onClick(); for (let i = 0; i < 100 && !slots[5]; i++) await new Promise(resolve => setTimeout(resolve, 10)); render();
  assert.equal(links, 1, 'Share and QR reuse the same link');
  assert.ok(find(n => n.props?.alt?.startsWith('QR')).props.src.startsWith('data:image/png;base64,'));
  find(n => n.props?.['aria-label'] === 'ตั้งค่าใบงาน').props.onClick(); render();
  find(n => n.type === 'input' && n.props.type === 'tel').props.onChange({ target: { value: '099' } }); render();
  find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await flush(); render();
  assert.equal(saved[0].id, 'job-a'); assert.equal(saved[1].driverPhone, '099'); assert.equal(saved[2], actor);
  find(n => n.props?.id === 'job-tab-1').props.onClick(); render();
  const file = { name: 'proof.pdf' };
  find(n => n.props?.type === 'file').props.onChange({ target: { files: [file], value: 'proof.pdf' } }); await flush();
  assert.equal(uploaded[0].id, 'job-a'); assert.equal(uploaded[1], file);
  render(false); assert.equal(find(n => n.props?.type === 'file').props.disabled, true);
  const css = fs.readFileSync('apps/web/app/styles.css', 'utf8');
  assert.match(css, /\.job-detail-modal\[open\][^}]*overflow: hidden/);
  assert.match(css, /\.job-detail-body[^}]*overflow-y: auto/);
  assert.match(css, /\.job-detail-toolbar[^}]*flex: 0 0 auto/);
  console.log('PASS: tabs, Share/QR, settings, upload, permissions and fixed-header scroll structure');
})().catch(error => { console.error(error); process.exitCode = 1; });
