const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {}, require: name => {
  if (name === 'firebase/firestore') return {};
  if (name === 'firebase/storage') return {};
  if (name === '@s-fast-transport/shared') return { statusLabels: {} };
  return {};
} };

vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText, context);

const jobs = [
  { id: 'legacy', assignedDriverUid: 'user-1', driverName: 'Google Account Name', driverPhone: '0800000000' },
  { id: 'unlinked', driverName: 'ชื่อเดิม', driverPhone: '0810000000' }
];
const identities = new Map([
  ['user-1', { fullName: 'นายสมชาย ใจดี', phone: '0891234567', photoURL: 'https://example.com/uploaded-driver.webp' }]
]);
const resolved = context.exports.resolveCurrentDriverIdentities(jobs, identities);
const uploadedIdentity = context.exports.currentDriverIdentity({
  fullName: 'นายสมชาย ใจดี',
  profilePhotoPath: 'profile_photos/user-1/photo.webp',
  photoURL: 'https://example.com/uploaded.webp',
  googlePhotoURL: 'https://example.com/google.webp'
});
const googleIdentity = context.exports.currentDriverIdentity({
  fullName: 'นายสมชาย ใจดี',
  profilePhotoPath: '',
  photoURL: 'https://example.com/google.webp'
});

assert.equal(resolved[0].driverName, 'นายสมชาย ใจดี', 'current profile name replaces the stale Google name');
assert.equal(resolved[0].driverPhone, '0891234567', 'current profile phone replaces the stale job snapshot');
assert.equal(resolved[0].driverPhotoUrl, 'https://example.com/uploaded-driver.webp', 'current profile photo is available to the map');
assert.equal(resolved[1].driverName, 'ชื่อเดิม', 'unlinked legacy jobs retain their saved name');
assert.notEqual(resolved[0], jobs[0], 'job objects are not mutated');
assert.equal(uploadedIdentity.photoURL, 'https://example.com/uploaded.webp', 'uploaded profile photo has priority');
assert.equal(googleIdentity.photoURL, 'https://example.com/google.webp', 'Google photo is used as fallback');
console.log('PASS: current driver profile identity replaces stale Google job identity');
