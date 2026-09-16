const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compile = text => ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
let slots = [], cursor = 0, selected;
const context = { React, exports: {}, require: name => {
  if (name === 'react') return { ...React, useMemo: fn => fn(), useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; } };
  if (name === '@s-fast-transport/shared') return { statusLabels: { assigned: 'Assigned', completed: 'Completed', cancelled: 'Cancelled', problem: 'Problem' } };
  return require(name);
}};
vm.runInNewContext(compile(fs.readFileSync('apps/web/app/components/AdminDashboard.tsx', 'utf8')), context);
const makeJob = (id, status, alerts = []) => ({ id, status, alerts, workOrder: `WO-${id}`, customer: 'Customer', driverName: 'Driver', vehiclePlate: 'TRUCK', pickupLocation: 'Origin', deliveryLocation: 'Destination', eta: '16:00' });
const jobs = [makeJob('active', 'assigned'), makeJob('problem', 'problem'), makeJob('done', 'completed', ['Old alert']), makeJob('cancel', 'cancelled')];
let tree;
function render(data = jobs, dataState = 'ready') { cursor = 0; tree = context.exports.default({ jobs: data, dataState, selectedJobId: '', onSelectJob: id => { selected = id; } }); }
function nodes(node = tree) { if (!node || typeof node !== 'object') return []; return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)]; }
function find(predicate) { const result = nodes().find(predicate); assert.ok(result, 'Expected UI element'); return result; }
function cardIds() { return nodes().filter(n => n.props?.['aria-haspopup'] === 'dialog').map(n => n.props['aria-label']); }
render();
assert.equal(cardIds().length, 4);
find(n => n.props?.className === 'dashboard-metric active').props.onClick(); render(); assert.equal(cardIds().length, 2, 'Active excludes completed/cancelled');
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
const navigation = { React, adminScreen: 'Dashboard', mode: 'admin', jobs, activeJobs: jobs.slice(0, 2), jobsState: 'ready', selectedJob: jobs[2], selectedJobId: 'done', jobDetailOpen: true, canWrite: true, profile: {},
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
