const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let receive, timer, cleared = false, stopped = false;
const data = [];
const context = {
  exports: {},
  require: (name) => name === './firebase' ? { db: {} } : {
    doc: (...args) => args,
    onSnapshot: (_ref, callback) => { receive = callback; return () => { stopped = true; }; }
  },
  Date, Number,
  setTimeout: (callback) => { timer = callback; return 1; },
  clearTimeout: () => { cleared = true; }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/public-tracking-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const stop = context.exports.subscribePublicTracking('token', item => data.push(item), error => { throw new Error(error); });
let expiresAt = Date.now() + 60000;
const snapshot = enabled => ({ exists: () => true, data: () => ({ enabled, expiresAt: { toMillis: () => expiresAt }, workOrder: 'JOB-1' }) });
receive(snapshot(true));
assert.equal(data.at(-1).workOrder, 'JOB-1');
receive(snapshot(false));
assert.equal(data.at(-1), null, 'revoked links must clear displayed data');
expiresAt = Date.now() - 1;
receive(snapshot(true));
assert.equal(data.at(-1), null, 'expired links must not display data even for an admin');
expiresAt = Date.now() + 60000;
receive(snapshot(true));
const originalNow = Date.now;
Date.now = () => expiresAt + 1;
try { timer(); assert.equal(data.at(-1), null, 'open pages must expire without a new snapshot'); }
finally { Date.now = originalNow; }
stop();
assert.ok(stopped && cleared, 'subscription and timer must be cleaned up');
console.log('PASS: active, revoked, expired, open-page expiry, listener cleanup');
