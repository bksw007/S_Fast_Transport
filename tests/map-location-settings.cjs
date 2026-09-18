const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const pickerSource = fs.readFileSync('apps/web/app/components/LocationPicker.tsx', 'utf8');
assert.ok(!pickerSource.includes('ListManagerComboBox'), 'job location picker must not mix generic text options with map records');
assert.ok(pickerSource.includes('selectSavedLocation'), 'picker must select one complete saved-location record');
const comboSource = fs.readFileSync('apps/web/app/components/ListManagerComboBox.tsx', 'utf8');
const selectItemBody = comboSource.match(/function selectItem[\s\S]*?\n  }/)?.[0] || '';
assert.ok(!selectItemBody.includes('inputRef.current?.focus()'), 'selecting an item must not immediately reopen the dropdown through input focus');

const firestore = {
  addDoc: async () => ({ id: 'new' }), collection: () => ({}), doc: () => ({}),
  onSnapshot: () => () => {}, orderBy: () => ({}), query: () => ({}),
  serverTimestamp: () => 'SERVER_TIME', updateDoc: async () => {}
};
const context = { exports: {}, URL, require: name => {
  if (name === 'firebase/firestore') return firestore;
  if (name === './firebase') return { db: {} };
  if (name === './transport-repository') return { canManageOrganizationLists: () => true };
  return {};
} };
const repositorySource = fs.readFileSync('apps/web/lib/location-repository.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(repositorySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

const locations = [
  { id: 'a', name: 'คลัง A', navigationUrl: 'https://maps.google.com/a', originalMapsUrl: 'https://maps.app.goo.gl/a', lat: 13, lng: 100, organizationId: 'main', notes: '', active: true },
  { id: 'b', name: 'คลัง B', googleName: 'Bangkok Port', navigationUrl: 'https://maps.google.com/b', originalMapsUrl: 'https://maps.app.goo.gl/b', lat: 14, lng: 101, organizationId: 'main', notes: 'ประตู 3', active: false }
];
const selected = context.exports.selectSavedLocation('a', locations);
assert.equal(selected.name, 'คลัง A');
assert.equal(selected.place.locationId, 'a');
assert.equal(selected.place.navigationUrl, 'https://maps.google.com/a');
assert.equal(selected.place.lat, 13);
assert.equal(context.exports.selectSavedLocation('', locations), null);
assert.deepEqual(context.exports.filterSavedLocations(locations, 'bangkok', 'all').map(item => item.id), ['b']);
assert.deepEqual(context.exports.filterSavedLocations(locations, 'ประตู 3', 'all').map(item => item.id), ['b']);
assert.deepEqual(context.exports.filterSavedLocations(locations, '', 'active').map(item => item.id), ['a']);
assert.deepEqual(context.exports.filterSavedLocations(locations, '', 'inactive').map(item => item.id), ['b']);

const managementSource = fs.readFileSync('apps/web/app/components/LocationManagementScreen.tsx', 'utf8');
for (const expected of ['รายการพิกัดแผนที่', 'ค้นหาชื่อ สถานที่ หรือคำแนะนำ', 'filterSavedLocations', 'กำลังแก้ไข']) {
  assert.ok(managementSource.includes(expected), `management screen must show ${expected}`);
}
console.log('PASS: job locations use one complete saved map record and never mix legacy text dropdown state');
