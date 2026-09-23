const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const sourceText = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const source = ts.createSourceFile('page.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['nextDriverAction', 'JobSummaryCard']);
const statements = source.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text))
  || (ts.isVariableStatement(node) && /driverNextActionByStatus/.test(node.getText(source)))
);
const code = `${statements.map(node => node.getText(source)).join('\n')}\nexport { JobSummaryCard };`;
const context = {
  exports: {},
  React,
  useState: () => [true, () => {}],
  formatPhoneNumber: value => value,
  statusLabels: { assigned: 'มอบหมายแล้ว', accepted: 'รับงานแล้ว', to_delivery: 'กำลังไปจุดส่ง' },
  driverActions: [
    { id: 'start_tracking', label: 'เริ่มแชร์ตำแหน่ง', nextStatus: 'accepted' },
    { id: 'arrived_pickup', label: 'ถึงจุดรับสินค้า', nextStatus: 'arrived_pickup' },
    { id: 'arrived_delivery', label: 'ถึงจุดส่งสินค้า', nextStatus: 'arrived_delivery' }
  ],
  MapPin: () => null, ArrowRight: () => null, ChevronUp: () => null, ChevronDown: () => null,
  UserRound: () => null, Phone: () => null, Truck: () => null, CircleDot: () => null
};
vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, context);

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
function job(status) {
  return { id: 'job-1', workOrder: 'JN-1', status, pickupLocation: 'FMT', deliveryLocation: 'Freezone', alerts: [], driverPhone: '0929489777', driverName: 'คนขับ', vehiclePlate: '72-2211', customer: 'ลูกค้า', eta: '10:00', lastUpdatedMinutes: 1 };
}

assert.equal(context.exports.nextDriverAction(job('assigned')).nextStatus, 'accepted');
assert.equal(context.exports.nextDriverAction(job('accepted')).nextStatus, 'arrived_pickup');
assert.equal(context.exports.nextDriverAction(job('to_delivery')).nextStatus, 'arrived_delivery');
assert.equal(context.exports.nextDriverAction(job('completed')), null);

let action;
const tree = context.exports.JobSummaryCard({ job: job('accepted'), selected: true, canWrite: true, onSelect: () => {}, onAction: (status, selectedJob) => { action = [status, selectedJob.id]; } });
const button = nodes(tree).find(node => node.props?.className === 'job-next-action');
assert.ok(button, 'expanded today job must show its next action');
assert.match(React.Children.toArray(button.props.children).join(''), /ถึงจุดรับสินค้า/);
button.props.onClick();
assert.deepEqual(action, ['arrived_pickup', 'job-1']);

console.log('PASS: today job card exposes exactly its next driver action');
