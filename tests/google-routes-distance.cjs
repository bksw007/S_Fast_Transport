const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/google-routes-distance.ts', 'utf8');
const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true }
}).outputText, context);

(async () => {
  const origin = { lat: 13.7563, lng: 100.5018 };
  const destination = { lat: 13.6500, lng: 100.6500 };
  assert.equal(context.exports.coordinateFingerprint(origin, destination), '13.756300,100.501800>13.650000,100.650000');
  assert.equal(context.exports.coordinateFingerprint({ lat: 91, lng: 0 }, destination), null);
  const outward = { pickupPlace: origin, deliveryPlace: destination, routeDistanceMeters: 24567,
    routeDistanceFingerprint: '13.756300,100.501800>13.650000,100.650000', routeDistanceProvider: 'google_routes' };
  const returnTrip = { pickupPlace: destination, deliveryPlace: origin };
  assert.equal(context.exports.jobRouteDistanceSummary(outward).totalMeters, 24567, 'one-way jobs retain their outward total');
  assert.equal(context.exports.jobRouteDistanceSummary({ ...outward, returnTrip }).totalMeters, null, 'a return job must not show outward distance as its total');
  assert.deepEqual(JSON.parse(JSON.stringify(context.exports.jobRouteDistanceSummary({ ...outward, returnTrip,
    returnRouteDistanceMeters: 26700,
    returnRouteDistanceFingerprint: '13.650000,100.650000>13.756300,100.501800',
    returnRouteDistanceProvider: 'google_routes'
  }))), { outwardMeters: 24567, returnMeters: 26700, totalMeters: 51267 });
  assert.equal(context.exports.jobRouteDistanceSummary({ ...outward, returnTrip, returnRouteDistanceMeters: 26700,
    returnRouteDistanceFingerprint: '13.650000,100.650000>13.756300,100.501800', returnRouteDistanceProvider: 'google_routes',
    deliveryPlace: { lat: 14, lng: 101 }
  }).totalMeters, null, 'stale outward coordinates invalidate the total');
  assert.equal(context.exports.jobRouteDistanceSummary({ ...outward, returnTrip: { ...returnTrip, deliveryPlace: { lat: 14, lng: 101 } },
    returnRouteDistanceMeters: 26700, returnRouteDistanceFingerprint: '13.650000,100.650000>13.756300,100.501800',
    returnRouteDistanceProvider: 'google_routes'
  }).totalMeters, null, 'stale return coordinates invalidate the total');

  let request;
  const distance = await context.exports.requestGoogleRouteDistance(origin, destination, 'server-key', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ routes: [{ distanceMeters: 24567 }] }) };
  });
  assert.equal(distance, 24567);
  assert.equal(request.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(request.options.headers['X-Goog-Api-Key'], 'server-key');
  assert.equal(request.options.headers['X-Goog-FieldMask'], 'routes.distanceMeters');
  const body = JSON.parse(request.options.body);
  assert.equal(body.travelMode, 'DRIVE');
  assert.equal(body.routingPreference, 'TRAFFIC_UNAWARE');
  assert.deepEqual(body.origin.location.latLng, { latitude: origin.lat, longitude: origin.lng });
  assert.deepEqual(body.destination.location.latLng, { latitude: destination.lat, longitude: destination.lng });

  await assert.rejects(
    context.exports.requestGoogleRouteDistance(origin, destination, '', async () => ({ ok: true })),
    /API key/
  );
  await assert.rejects(
    context.exports.requestGoogleRouteDistance(origin, destination, 'server-key', async () => ({ ok: true, json: async () => ({ routes: [] }) })),
    /ระยะทาง/
  );

  const routeSource = fs.readFileSync('apps/web/app/api/maps/distance/route.ts', 'utf8');
  assert.match(routeSource, /authorization/i, 'route requires the signed-in user token');
  assert.match(routeSource, /today_jobs/, 'route verifies access to the requested job');
  assert.match(routeSource, /GOOGLE_MAPS_ROUTES_API_KEY/, 'route uses a server-only API key');
  console.log('PASS: Google Routes distance uses basic traffic-unaware routing and a protected server key');
})().catch(error => { console.error(error); process.exitCode = 1; });
