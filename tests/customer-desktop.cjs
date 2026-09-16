const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const source = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let desktop;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'aside' && node.openingElement.attributes.getText(file).includes('desktop-panel')) desktop = node;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(desktop, 'Desktop workspace must exist');
const jobs = [{ id: 'active', status: 'assigned' }, { id: 'done', status: 'completed' }];
let received;
const context = {
  React, adminScreen: 'ลูกค้า', profile: { role: 'admin' }, jobs,
  activeJobs: jobs.slice(0, 1), selectedJob: jobs[0], canWrite: true,
  isMainAdmin: actor => actor.role === 'admin',
  CustomerManagementScreen: props => { received = props; return React.createElement('button', null, 'เพิ่มลูกค้า'); },
  FeatureOverview: () => React.createElement('p', null, 'DEMO'),
};
const code = ts.transpileModule(`globalThis.result = (${desktop.getText(file)});`, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, context);
const html = renderToStaticMarkup(context.result);
assert.ok(html.includes('เพิ่มลูกค้า') && !html.includes('DEMO'), 'Desktop customer menu must render the working customer screen, not demo');
assert.equal(received.jobs, jobs, 'Desktop must include completed jobs');
assert.equal(received.actor, context.profile);
assert.equal(received.canWrite, true);
console.log('PASS: desktop customer menu renders working screen with complete job list and permissions');
