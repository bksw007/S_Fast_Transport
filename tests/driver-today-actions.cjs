const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const sourceText = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const source = ts.createSourceFile('page.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const wanted = new Set(['nextDriverAction', 'activeDriverStop', 'formatStopSchedule', 'routeDistanceLabel', 'stopNavigationUrl', 'JobSummaryCard']);
const statements = source.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && wanted.has(node.name.text))
  || (ts.isVariableStatement(node) && /(driverNextActionByStatus|thaiShortMonths)/.test(node.getText(source)))
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
  UserRound: () => null, Phone: () => null, Truck: () => null, CircleDot: () => null,
  Navigation: () => null, CalendarClock: () => null, Route: () => null, PackageCheck: () => null, MapPinned: () => null,
  AlertTriangle: () => null, TriangleAlert: () => null, Clock3: () => null
};
vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, context);

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
function job(status) {
  return {
    id: 'job-1', workOrder: 'JN-1', status, pickupLocation: 'FMT', deliveryLocation: 'Freezone', alerts: [],
    driverPhone: '0929489777', driverName: 'คนขับ', vehiclePlate: '72-2211', customer: 'ลูกค้า', eta: '10:00', lastUpdatedMinutes: 1,
    pickupDate: '2026-09-23', pickupTime: '09:30', deliveryDate: '2026-09-23', deliveryTime: '13:00', routeDistanceMeters: 64500,
    pickupContact: 'คุณรับ', pickupContactPhone: '0811111111', deliveryContact: 'คุณส่ง', deliveryContactPhone: '0822222222'
  };
}

assert.equal(context.exports.nextDriverAction(job('assigned')).nextStatus, 'accepted');
assert.equal(context.exports.nextDriverAction(job('accepted')).nextStatus, 'arrived_pickup');
assert.equal(context.exports.nextDriverAction(job('to_delivery')).nextStatus, 'arrived_delivery');
assert.equal(context.exports.nextDriverAction(job('completed')), null);
assert.equal(context.exports.activeDriverStop(job('assigned')), 'pickup');
assert.equal(context.exports.activeDriverStop(job('loading')), 'pickup');
assert.equal(context.exports.activeDriverStop(job('to_delivery')), 'delivery');
assert.equal(context.exports.activeDriverStop(job('completed')), 'delivery');
assert.equal(context.exports.activeDriverStop({ ...job('problem'), issuePreviousStatus: 'to_delivery' }), 'delivery');
assert.equal(context.exports.activeDriverStop(job('cancelled')), null);
assert.equal(context.exports.formatStopSchedule('2026-09-23', '09:30'), '23 ก.ย. 2569 · 09:30 น.');
assert.equal(context.exports.routeDistanceLabel(64500), 'ระยะทางประมาณ 64.5 กม.');
assert.equal(context.exports.routeDistanceLabel(undefined), 'ยังไม่มีข้อมูลระยะทาง');
assert.equal(context.exports.stopNavigationUrl('FMT', { navigationUrl: 'https://maps.example/pickup' }), 'https://maps.example/pickup');
assert.match(context.exports.stopNavigationUrl('FMT บางนา', undefined), /query=FMT%20%E0%B8%9A%E0%B8%B2%E0%B8%87%E0%B8%99%E0%B8%B2/);

let action, issueJobId;
const tree = context.exports.JobSummaryCard({ job: job('accepted'), selected: true, canWrite: true, onSelect: () => {}, onAction: (status, selectedJob) => { action = [status, selectedJob.id]; }, onReportIssue: selectedJob => { issueJobId = selectedJob.id; } });
const renderedNodes = nodes(tree);
const topLine = renderedNodes.find(node => node.props?.className === 'job-summary-topline');
assert.ok(topLine, 'work order and status must share the first line');
assert.ok(nodes(topLine).some(node => String(node.props?.className || '').includes('status')));
const routeLine = renderedNodes.find(node => node.props?.className === 'job-summary-route');
assert.ok(routeLine, 'pickup and delivery must have a dedicated route line');
assert.ok(nodes(routeLine).some(node => node.props?.children === 'FMT'));
assert.ok(nodes(routeLine).some(node => node.props?.children === 'Freezone'));
assert.equal(renderedNodes.filter(node => String(node.props?.className || '').includes('job-stop-card')).length, 2);
assert.ok(renderedNodes.some(node => node.props?.children === 'คุณรับ'));
assert.ok(!renderedNodes.some(node => node.props?.children === 'คุณส่ง'), 'future delivery contact stays hidden before departure');
assert.ok(!renderedNodes.some(node => node.props?.children === 'ETA'));
assert.ok(!renderedNodes.some(node => node.props?.children === 'อัปเดตล่าสุด'));
assert.ok(!renderedNodes.some(node => node.props?.children === 'การแจ้งเตือน'));
const issueButton = renderedNodes.find(node => node.props?.className === 'job-report-issue');
assert.ok(issueButton, 'active job exposes issue reporting');
issueButton.props.onClick();
assert.equal(issueJobId, 'job-1');
const button = nodes(tree).find(node => node.props?.className === 'job-next-action');
assert.ok(button, 'expanded today job must show its next action');
assert.match(React.Children.toArray(button.props.children).join(''), /ถึงจุดรับสินค้า/);
button.props.onClick();
assert.deepEqual(action, ['arrived_pickup', 'job-1']);

const deliveryTree = context.exports.JobSummaryCard({ job: job('to_delivery'), selected: true, canWrite: true, onSelect: () => {}, onAction: () => {}, onReportIssue: () => {} });
const deliveryNodes = nodes(deliveryTree);
assert.ok(deliveryNodes.some(node => node.props?.children === 'คุณส่ง'));
assert.ok(!deliveryNodes.some(node => node.props?.children === 'คุณรับ'), 'pickup contact is hidden after departure');

const problemTree = context.exports.JobSummaryCard({ job: { ...job('problem'), issuePreviousStatus: 'to_delivery', lastIssue: { note: 'รถติดหน้าด่าน' } }, selected: true, canWrite: true, onSelect: () => {}, onAction: () => {}, onReportIssue: () => {} });
assert.ok(nodes(problemTree).some(node => node.props?.className === 'job-issue-banner'), 'reported issue remains visible while the driver continues the same step');

const css = fs.readFileSync('apps/web/app/styles.css', 'utf8') + fs.readFileSync('apps/web/app/theme.css', 'utf8');
assert.match(css, /\.job-summary-toggle\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;/s);
assert.match(css, /\.job-summary-route\s*\{[^}]*white-space:\s*normal;/s);

console.log('PASS: today job card exposes exactly its next driver action');
