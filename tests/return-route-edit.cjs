const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const pickupPlace = { lat: 13.7563, lng: 100.5018 };
const deliveryPlace = { lat: 13.65, lng: 100.65 };
const changedReturnPlace = { lat: 14, lng: 101 };
const current = { id: 'job-1', workOrder: 'JN-1', status: 'assigned', organizationId: 'main', originOrganizationId: 'main', driverId: 'driver-1',
  customer: 'ลูกค้า', pickupPlace, deliveryPlace,
  returnTrip: { pickupPlace: deliveryPlace, deliveryPlace: pickupPlace },
  routeDistanceMeters: 24567, returnRouteDistanceMeters: 26700 };
let update;
const deleted = Symbol('deleted');
const firestore = {
  collection: () => ({}), doc: (_db, collection, id) => ({ path: `${collection}/${id || 'event'}` }), deleteField: () => deleted,
  getDoc: async () => ({ exists: () => true, data: () => current }),
  getDocs: async () => ({ empty: true, docs: [] }), query: value => value, where: () => ({}),
  runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => true, data: () => current }), update: (_ref, value) => { update = value; }, set: () => {} }),
  serverTimestamp: () => 'NOW'
};
const context = { exports: {}, require: name => {
  if (name === 'firebase/firestore') return firestore;
  if (name === '@/lib/transport-repository' || name === './transport-repository') return { isMainAdmin: () => true, hasApprovedAccess: () => true };
  if (name === './job-edit') return { validateJobEditDraft: value => value };
  if (name === './customer-repository') return { resolveCustomerId: async () => null };
  if (name === './google-routes-distance') return { coordinateFingerprint: (from, to) => from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : null };
  if (name === '@s-fast-transport/shared') return { statusLabels: {} };
  if (name === 'firebase/functions') return {};
  return { db: {}, firebaseApp: {} };
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/lib/job-detail-repository.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);

(async () => {
  const actor = { uid: 'admin', role: 'admin', organizationId: 'main' };
  await context.exports.updateJobDetails(current, { ...current, assignedOrganizationId: 'main', returnTrip: { ...current.returnTrip, deliveryPlace: changedReturnPlace } }, actor);
  assert.equal(update.returnRouteDistanceMeters, deleted, 'changing return coordinates clears only the return distance');
  assert.equal(update.routeDistanceMeters, undefined, 'unchanged outward distance stays cached');
  await context.exports.updateJobDetails(current, { ...current, assignedOrganizationId: 'main', returnTrip: undefined }, actor);
  assert.equal(update.returnRouteDistanceMeters, deleted, 'removing a return trip clears its cached distance');
  console.log('PASS: editing return stops invalidates only the return distance');
})().catch(error => { console.error(error); process.exitCode = 1; });
