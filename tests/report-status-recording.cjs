const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
async function check(fileName, functionName) {
  const source = ts.createSourceFile(fileName, fs.readFileSync(fileName, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === functionName);
  let data = {}, counter = 0, writes = [];
  const context = {
    exports: {}, Date, db: {}, doc: (_db, collection, id) => ({ collection, id }), collection: () => ({}),
    serverTimestamp: () => `server-time-${++counter}`, toTrackingStatus: () => 'arrived_delivery',
    statusLabels: { arrived_delivery: 'ถึงจุดส่ง', completed: 'เสร็จ' }, addDoc: async () => {}, syncActiveShareLinks: async () => {},
    runTransaction: async (_db, operation) => operation({
      get: async () => ({ exists: () => true, data: () => data }),
      update: (_ref, patch) => { writes.push(patch); data = { ...data, ...patch }; }
    })
  };
  vm.runInNewContext(ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const update = context.exports[functionName];
  const job = { id: 'job', trackingEnabled: true, currentLocation: { lat: 1, lng: 2 } };
  const actor = { uid: 'driver', displayName: 'Driver', organizationId: 'main' };
  await update(job, 'arrived_delivery', actor);
  const arrival = data.arrivedDeliveryAt;
  assert.ok(arrival);
  await update(job, 'arrived_delivery', actor);
  assert.equal(data.arrivedDeliveryAt, arrival, 'Stale client and repeated button press must preserve first arrival');
  assert.equal(Object.hasOwn(writes[1], 'arrivedDeliveryAt'), false);
  await update(job, 'completed', actor);
  const completed = data.completedAt;
  assert.ok(completed);
  await update(job, 'completed', actor);
  assert.equal(data.completedAt, completed);
  assert.equal(data.arrivedDeliveryAt, arrival);
  assert.equal(data.trackingEnabled, false);
}
(async () => {
  await check('apps/web/lib/transport-repository.ts', 'updateJobStatus');
  await check('apps/mobile/src/transport-repository.ts', 'updateDriverJobStatus');
  console.log('PASS: web and mobile store server timestamps and preserve first arrival/completion on repeated updates');
})().catch(error => { console.error(error); process.exit(1); });
