const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const fileName = 'apps/web/lib/transport-repository.ts';
const source = ts.createSourceFile(fileName, fs.readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest, true);
const statements = source.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name?.text === 'reportDriverIssue')
  || (ts.isVariableStatement(node) && /driverIssueLabels/.test(node.getText(source)))
);
const code = statements.map(node => node.getText(source)).join('\n');
let jobData = { status: 'accepted', alerts: ['เดิม'], organizationId: 'main' };
let eventData;
const context = {
  exports: {},
  Date,
  db: {},
  doc: (_db, collectionName, id) => ({ collectionName, id }),
  collection: (_db, name) => ({ name }),
  serverTimestamp: () => 'server-time',
  runTransaction: async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => jobData }),
    update: (_ref, patch) => { jobData = { ...jobData, ...patch }; },
    set: (_ref, data) => { eventData = data; }
  })
};
vm.runInNewContext(ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, context);

(async () => {
  const job = { id: 'job-1', status: 'accepted', organizationId: 'main', currentLocation: { lat: 13.7, lng: 100.5 } };
  const actor = { uid: 'driver-1', displayName: 'คนขับ', organizationId: 'main' };
  await context.exports.reportDriverIssue(job, 'traffic', 'รถติดหน้าด่าน', actor);
  assert.equal(jobData.status, 'problem');
  assert.equal(jobData.issuePreviousStatus, 'accepted');
  assert.equal(jobData.lastIssue.type, 'traffic');
  assert.match(jobData.alerts.at(-1), /จราจรติดขัด.*รถติดหน้าด่าน/);
  assert.equal(eventData.type, 'driver_issue');
  assert.equal(eventData.metadata.issueType, 'traffic');
  assert.equal(eventData.metadata.previousStatus, 'accepted');
  assert.equal(eventData.lat, 13.7);
  console.log('PASS: driver issue report preserves workflow and records an admin-visible event');
})().catch(error => { console.error(error); process.exitCode = 1; });
