const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const origin = { lat: 13.7563, lng: 100.5018 };
const destination = { lat: 13.65, lng: 100.65 };
const point = ({ lat, lng }) => ({ mapValue: { fields: { lat: { doubleValue: lat }, lng: { doubleValue: lng } } } });
const fields = { pickupPlace: point(origin), deliveryPlace: point(destination), returnTrip: { mapValue: { fields: {
  pickupPlace: point(destination), deliveryPlace: point(origin)
} } } };
let requestedRoute;
const context = { exports: {}, process: { env: { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project', GOOGLE_MAPS_ROUTES_API_KEY: 'test-key' } }, AbortSignal,
  fetch: async () => ({ ok: true, json: async () => ({ fields }) }),
  require: name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name === '@/lib/google-routes-distance') return {
      validRouteCoordinate: value => value && Number.isFinite(value.lat) && Number.isFinite(value.lng),
      coordinateFingerprint: (from, to) => from && to ? `${from.lat},${from.lng}>${to.lat},${to.lng}` : null,
      requestGoogleRouteDistance: async (from, to) => { requestedRoute = { from, to }; return 26700; }
    };
    return require(name);
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('apps/web/app/api/maps/distance/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, context);
const request = (leg, from, to) => ({ headers: { get: () => 'Bearer signed-user' }, json: async () => ({ jobId: 'job-1', leg, origin: from, destination: to }) });

(async () => {
  const returned = await context.exports.POST(request('return', destination, origin));
  assert.equal(returned.status, 200, 'the saved return leg is authorized');
  assert.equal(returned.body.distanceMeters, 26700);
  assert.deepEqual(JSON.parse(JSON.stringify(requestedRoute)), { from: destination, to: origin });
  const mismatch = await context.exports.POST(request('return', origin, destination));
  assert.equal(mismatch.status, 409, 'the return leg cannot request outward coordinates');
  const invalid = await context.exports.POST(request('other', destination, origin));
  assert.equal(invalid.status, 400, 'unknown legs are rejected');
  console.log('PASS: map distance API validates the requested saved leg');
})().catch(error => { console.error(error); process.exitCode = 1; });
