const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const file = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let desktop, mobile;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'aside' && node.openingElement.attributes.getText(file).includes('desktop-panel')) desktop = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'AdminMobileScreen') mobile = node;
  ts.forEachChild(node, visit);
}
visit(file);
const jobs = [{ id: 'active', status: 'assigned' }, { id: 'done', status: 'completed' }];
let received;
const context = { React, adminScreen: 'Reports', profile: { role: 'admin' }, jobs, jobsState: 'ready',
  isMainAdmin: () => true,
  ReportsScreen: props => { received = props; return React.createElement('div', null, 'LIVE REPORT'); },
  FeatureOverview: () => React.createElement('p', null, 'DEMO')
};
const transpile = code => ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(transpile(`globalThis.result = (${desktop.getText(file)});`), context);
assert.ok(renderToStaticMarkup(context.result).includes('LIVE REPORT'));
assert.equal(received.jobs, jobs);
assert.equal(received.dataState, 'ready');
vm.runInNewContext(transpile(mobile.getText(file)), context);
const mobileElement = context.AdminMobileScreen({ allJobs: jobs, profile: {}, screen: 'Reports', jobsState: 'error' });
assert.ok(renderToStaticMarkup(mobileElement).includes('LIVE REPORT'));
assert.equal(received.jobs, jobs);
assert.equal(received.dataState, 'error');
console.log('PASS: desktop and mobile Reports use all real jobs and propagate loading/error state');
