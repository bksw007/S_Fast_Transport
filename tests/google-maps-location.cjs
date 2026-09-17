const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('apps/web/lib/google-maps-link.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, URL };
vm.runInNewContext(code, context);
const api = context.exports;

assert.equal(api.isAllowedGoogleMapsUrl('https://maps.app.goo.gl/qT6UNYEjzgxbGRbH9'), true);
assert.equal(api.isAllowedGoogleMapsUrl('http://maps.app.goo.gl/test'), false);
assert.equal(api.isAllowedGoogleMapsUrl('https://maps.google.com.evil.test/maps'), false);

const original = 'https://maps.app.goo.gl/qT6UNYEjzgxbGRbH9';
const long = 'https://www.google.com/maps/place/%E0%B9%82%E0%B8%A3%E0%B8%87%E0%B8%9E%E0%B8%B1%E0%B8%81%E0%B8%AA%E0%B8%B4%E0%B8%99%E0%B8%84%E0%B9%89%E0%B8%B2%E2%80%8B13+%E0%B8%97%E0%B9%88%E0%B8%B2%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B9%80%E0%B8%97%E0%B8%9E%E2%80%8B%E0%B8%AF/@13.7061693,100.5784044,877m/data=!3m2!1e3!4b1!4m6!3m5!1s0x30e29f83a94117fb:0xb2e6f4cfc47a48b2!8m2!3d13.7061641!4d100.5809793!16s%2Fg%2F11rhcdwr_g';
const place = api.parseGoogleMapsUrl(original, long);
assert.equal(place.googleName, 'โรงพักสินค้า 13 ท่าเรือกรุงเทพฯ');
assert.equal(place.lat, 13.7061641);
assert.equal(place.lng, 100.5809793);
assert.ok(place.navigationUrl.includes('destination=13.7061641,100.5809793'));

const queryPlace = api.parseGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=13.1%2C100.2&query_place_id=ChIJtest');
assert.equal(queryPlace.googlePlaceId, 'ChIJtest');
assert.equal(queryPlace.lat, 13.1);
assert.throws(() => api.parseGoogleMapsUrl('https://example.com/maps/@13,100'));
assert.throws(() => api.parseGoogleMapsUrl('https://www.google.com/maps/place/no-coordinates'));
console.log('PASS: Google Maps URLs are validated, cleaned and converted to navigation coordinates');
