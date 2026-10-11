const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/route-history.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, context);
const { buildRecordedRoute } = context.exports;
const record = (id, lat, lng, time, extra = {}) => ({ id, data: {
  lat, lng, timestamp: { toMillis: () => Date.parse(time) }, accuracy: 12, speed: 40, ...extra
} });

const route = buildRecordedRoute([
  record('latest', 14.2002, 100.2002, '2026-10-10T09:26:00Z'),
  record('bad', 200, 100.2, '2026-10-10T09:22:00Z'),
  record('middle', 14.2, 100.2, '2026-10-10T09:25:00Z'),
  record('first', 14.1, 100.1, '2026-10-10T09:00:00Z'),
  record('zero', 0, 0, '2026-10-10T09:21:00Z')
]);
assert.deepEqual(Array.from(route.points, point => point.id), ['first', 'middle', 'latest']);
assert.deepEqual(Array.from(route.segments, segment => Array.from(segment, point => point.id)), [['first'], ['middle', 'latest']]);
assert.equal(route.gapCount, 1);
assert.equal(route.points[2].accuracy, 12);
const jump = buildRecordedRoute([
  record('a', 14.1, 100.1, '2026-10-10T09:00:00Z'),
  record('b', 15.1, 101.1, '2026-10-10T09:01:00Z')
]);
assert.equal(jump.gapCount, 1, 'an impossible GPS jump must not be connected');
assert.deepEqual(Array.from(buildRecordedRoute([]).segments), []);
console.log('PASS: recorded GPS points are chronological, invalid points excluded, long gaps stay disconnected');
