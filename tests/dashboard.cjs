const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compile = text => ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const shared = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('packages/shared/src/index.ts', 'utf8')), shared);
const schedule = { exports: {}, Date, Intl };
vm.runInNewContext(compile(fs.readFileSync('apps/web/lib/job-card-schedule.ts', 'utf8')), schedule);
let slots = [], cursor = 0, selected, permanentlyDeleted, dismissMessage;
const context = { React, exports: {}, window: { setTimeout: fn => { dismissMessage = fn; return 1; }, clearTimeout: () => {} }, require: name => {
  if (name === 'react') return { ...React, useEffect: fn => fn(), useMemo: fn => fn(), useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = value; }]; } };
  if (name === '@s-fast-transport/shared') return shared.exports;
  if (name === '@/lib/job-card-schedule') return schedule.exports;
  return require(name);
}};
vm.runInNewContext(compile(fs.readFileSync('apps/web/app/components/AdminDashboard.tsx', 'utf8')), context);
const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
const makeJob = (id, status, alerts = []) => ({ id, status, alerts, jobDate: `${currentMonth}-01`, workOrder: `WO-${id}`, customer: 'Customer', driverName: 'Driver', vehiclePlate: 'TRUCK', pickupLocation: 'Origin', deliveryLocation: 'Destination', eta: '16:00' });
const jobs = [makeJob('active', 'assigned'), makeJob('problem', 'problem'), makeJob('done', 'completed', ['Old alert']), makeJob('cancel', 'cancelled')];
let tree;
function render(data = jobs, dataState = 'ready', deletedJobs = []) { cursor = 0; tree = context.exports.default({ jobs: data, deletedJobs, dataState, selectedJobId: '', onSelectJob: id => { selected = id; }, onPermanentlyDelete: async job => { permanentlyDeleted = job.id; } }); }
function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function find(predicate) { const result = nodes().find(predicate); assert.ok(result, 'Expected UI element'); return result; }
function cardIds() { return nodes().filter(n => n.props?.['aria-haspopup'] === 'dialog').map(n => n.props['aria-label']); }
render();
assert.equal(find(n => n.type === 'select' && n.props?.value === currentMonth).props.value, currentMonth, 'dashboard starts with the Bangkok current month');
assert.equal(cardIds().length, 4);
find(n => n.props?.className === 'dashboard-metric active').props.onClick(); render(); assert.equal(cardIds().length, 1, 'Normal active tab excludes jobs requiring attention and closed jobs');
find(n => n.props?.className === 'dashboard-metric attention').props.onClick(); render(); assert.equal(cardIds().length, 1, 'Problem status is actionable, old closed-job alert is not');
find(n => n.props?.className === 'dashboard-metric completed').props.onClick(); render();
find(n => n.props?.['aria-haspopup'] === 'dialog').props.onClick(); assert.equal(selected, 'done');
find(n => n.props?.className === 'dashboard-metric all').props.onClick();
find(n => n.props?.['aria-label'] === 'ค้นหาใบงาน').props.onChange({ target: { value: 'wo-ACTIVE' } }); render(); assert.equal(cardIds().length, 1);
find(n => n.props?.['aria-label'] === 'ค้นหาใบงาน').props.onChange({ target: { value: 'missing' } }); render(); assert.equal(cardIds().length, 0);
slots = []; render(Array.from({ length: 13 }, (_, i) => makeJob(String(i), 'assigned'))); assert.equal(cardIds().length, 12);
find(n => n.props?.['aria-label'] === 'หน้าถัดไป').props.onClick(); render(Array.from({ length: 13 }, (_, i) => makeJob(String(i), 'assigned'))); assert.equal(cardIds().length, 1);
slots = []; render(jobs, 'loading'); assert.equal(cardIds().length, 0);
render(jobs, 'error'); assert.ok(find(n => n.props?.role === 'alert'));
slots = []; render();
const cancelFilter = nodes(find(n => n.props?.className === 'dashboard-filters')).find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('ยกเลิก'));
cancelFilter.props.onClick(); render();
find(n => n.props?.className === 'dashboard-delete-button').props.onClick(); render();
let confirmButton = find(n => n.props?.className === 'danger');
assert.equal(confirmButton.props.disabled, true, 'permanent deletion requires the work order');
find(n => n.type === 'input' && n.props?.placeholder === 'WO-cancel').props.onChange({ target: { value: 'WO-cancel' } }); render();
confirmButton = find(n => n.props?.className === 'danger');
assert.equal(confirmButton.props.disabled, false);
confirmButton.props.onClick();
assert.equal(permanentlyDeleted, 'cancel');
slots = []; render(jobs, 'ready', [makeJob('soft-deleted', 'cancelled')]);
nodes(find(n => n.props?.className === 'dashboard-filters')).find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('ยกเลิก')).props.onClick();
render(jobs, 'ready', [makeJob('soft-deleted', 'cancelled')]);
assert.equal(nodes().filter(n => n.props?.className === 'dashboard-delete-button').length, 2, 'soft-deleted jobs also offer permanent deletion');
slots = []; slots[0] = 'cancelled'; slots[8] = 'ลบใบงาน WO-cancel ถาวรแล้ว'; render();
assert.equal(find(n => n.props?.className === 'dashboard-delete-success').props.role, 'status');
assert.equal(typeof dismissMessage, 'function');
dismissMessage(); render();
assert.equal(nodes().filter(n => n.props?.className === 'dashboard-delete-success').length, 0, 'success message dismisses after timeout');
slots[8] = 'ลบใบงาน WO-cancel ถาวรแล้ว'; render();
find(n => n.props?.className === 'dashboard-metric all').props.onClick(); render();
assert.equal(nodes().filter(n => n.props?.className === 'dashboard-delete-success').length, 0, 'success message clears when changing tabs');
const datedJobs = [
  { ...makeJob('older-active', 'assigned'), pickupDate: '2026-10-08' },
  { ...makeJob('new-completed', 'completed'), pickupDate: '2026-10-12' },
  { ...makeJob('old-cancelled', 'cancelled'), pickupDate: '2026-10-06' },
  { ...makeJob('new-attention', 'problem'), pickupDate: '2026-10-13' },
  { ...makeJob('old-completed', 'completed'), pickupDate: '2026-10-07' },
  { ...makeJob('new-cancelled', 'cancelled'), pickupDate: '2026-10-11' },
  { ...makeJob('old-attention', 'problem'), pickupDate: '2026-10-09' },
  makeJob('undated', 'assigned')
];
function visibleOrders() { return nodes().filter(n => n.props?.className === 'dashboard-work-order').map(n => n.props.children); }
function selectTab(label) { nodes(find(n => n.props?.className === 'dashboard-filters')).find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes(label)).props.onClick(); render(datedJobs); }
slots = []; render(datedJobs); find(n => n.type === 'select' && n.props?.value === currentMonth).props.onChange({ target: { value: 'all' } }); render(datedJobs);
assert.deepEqual(visibleOrders(), ['WO-new-attention', 'WO-new-completed', 'WO-new-cancelled', 'WO-old-attention', 'WO-older-active', 'WO-old-completed', 'WO-old-cancelled', 'WO-undated']);
selectTab('ยังไม่เสร็จ'); assert.deepEqual(visibleOrders(), ['WO-older-active', 'WO-undated']);
selectTab('ต้องติดตาม'); assert.deepEqual(visibleOrders(), ['WO-new-attention', 'WO-old-attention']);
selectTab('เสร็จงาน'); assert.deepEqual(visibleOrders(), ['WO-new-completed', 'WO-old-completed']);
selectTab('ยกเลิก'); assert.deepEqual(visibleOrders(), ['WO-new-cancelled', 'WO-old-cancelled']);

const today = new Date(Date.now() + 7 * 60 * 60 * 1000);
const todayKey = today.toISOString().slice(0, 10);
const tomorrowKey = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
const issueJobs = [
  { ...makeJob('pending-issue', 'problem', ['คนขับแจ้งปัญหา']), lastIssue: { type: 'traffic', note: 'รถติด' }, issuePreviousStatus: 'to_pickup', pickupDate: todayKey, pickupTime: '13:00', deliveryDate: tomorrowKey, deliveryTime: '12:00' },
  { ...makeJob('resolved-issue', 'to_pickup', ['คนขับแจ้งปัญหา']), lastIssue: { type: 'traffic', note: 'รถติด', resolvedAt: '2026-10-14T00:00:00Z' }, pickupDate: tomorrowKey, pickupTime: '12:00' },
  { ...makeJob('delivery-stage', 'to_delivery'), pickupDate: todayKey, pickupTime: '09:00', deliveryDate: tomorrowKey, deliveryTime: '12:00' }
];
slots = []; render(issueJobs);
assert.ok(renderToStaticMarkup(tree).includes('ETA รับสินค้า วันนี้ 13:00'));
assert.ok(renderToStaticMarkup(tree).includes('ETA ส่งสินค้า พรุ่งนี้ 12:00'));
nodes(find(n => n.props?.className === 'dashboard-filters')).find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('ต้องติดตาม')).props.onClick(); render(issueJobs);
assert.deepEqual(visibleOrders(), ['WO-pending-issue'], 'unanswered driver issues stay in attention');
nodes(find(n => n.props?.className === 'dashboard-filters')).find(n => n.type === 'button' && React.Children.toArray(n.props.children).includes('ยังไม่เสร็จ')).props.onClick(); render(issueJobs);
assert.deepEqual(visibleOrders(), ['WO-resolved-issue', 'WO-delivery-stage'], 'answered issue returns to the normal active tab');

const twoDaysKey = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);
slots = []; render([
  { ...makeJob('today-date-only', 'assigned'), pickupDate: todayKey },
  { ...makeJob('tomorrow-date-only', 'assigned'), pickupDate: tomorrowKey },
  { ...makeJob('two-days-date-only', 'assigned'), pickupDate: twoDaysKey },
  { ...makeJob('delivery-date-only', 'to_delivery'), deliveryDate: twoDaysKey }
]);
const dateOnlyCards = renderToStaticMarkup(tree);
assert.ok(dateOnlyCards.includes('ETA รับสินค้า วันนี้'), 'pickup date is shown even without a time');
assert.ok(dateOnlyCards.includes('ETA รับสินค้า พรุ่งนี้'));
assert.ok(dateOnlyCards.includes('ETA รับสินค้า อีก 2 วัน'));
assert.ok(dateOnlyCards.includes('ETA ส่งสินค้า อีก 2 วัน'), 'delivery date is shown after pickup');

const source = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let desktop, mobile, modal;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'aside' && node.openingElement.attributes.getText(file).includes('desktop-panel')) desktop = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'AdminMobileScreen') mobile = node;
  if (ts.isJsxExpression(node) && node.expression && node.getText(file).includes('jobDetailOpen && jobs.some')) modal = node.expression;
  ts.forEachChild(node, visit);
}
visit(file);
let received, opened;
const navigation = { React, adminScreen: 'Dashboard', mode: 'admin', jobs, deletedJobs: [], activeJobs: jobs.slice(0, 2), jobsState: 'ready', selectedJob: jobs[2], selectedJobId: 'done', jobDetailOpen: true, canWrite: true, profile: {},
  permanentlyDeleteCancelledJob: async () => {},
  setSelectedJobId: id => { selected = id; }, setJobDetailOpen: value => { opened = value; },
  AdminDashboard: props => { received = props; return React.createElement('div'); },
  JobDetailModal: props => props.children, JobDetail: props => React.createElement('div', null, props.job.id), GoogleLiveMap: () => null,
};
vm.runInNewContext(compile(`globalThis.result = (${desktop.getText(file)});`), navigation); renderToStaticMarkup(navigation.result);
assert.equal(received.jobs, jobs); received.onSelectJob('done'); assert.equal(opened, true);
vm.runInNewContext(compile(mobile.getText(file)), navigation);
renderToStaticMarkup(navigation.AdminMobileScreen({ allJobs: jobs, activeJobs: jobs.slice(0, 2), screen: 'Dashboard', jobsState: 'ready', onSelectJob: () => {} }));
assert.equal(received.jobs, jobs, 'Mobile and desktop use the same complete dataset');
vm.runInNewContext(compile(`globalThis.result = (${modal.getText(file)});`), navigation);
assert.ok(renderToStaticMarkup(navigation.result).includes('done'), 'Completed jobs open the shared modal from Dashboard');
console.log('PASS: dashboard filters, search, pagination, loading/error, both layouts and completed-job modal');
