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
assert.equal(api.isAllowedGoogleMapsUrl('https://goo.gl/maps/oldShortLink'), true);
assert.equal(api.isAllowedGoogleMapsUrl('https://goo.gl/otherLink'), false);
assert.equal(api.isAllowedGoogleMapsUrl('http://maps.app.goo.gl/test'), false);
assert.equal(api.isAllowedGoogleMapsUrl('https://maps.google.com.evil.test/maps'), false);
assert.equal(api.extractGoogleMapsUrl('แชร์จาก Google Maps\nคลังสินค้า\nhttps://maps.app.goo.gl/qT6UNYEjzgxbGRbH9?g_st=ic'), 'https://maps.app.goo.gl/qT6UNYEjzgxbGRbH9?g_st=ic');
assert.equal(api.extractGoogleMapsUrl('https://maps.app.goo.gl/qT6UNYEjzgxbGRbH9\u200b'), 'https://maps.app.goo.gl/qT6UNYEjzgxbGRbH9');
const mobileShortLink = 'https://maps.app.goo.gl/MbL3hhPjaojp4TSA6?g_st=ac';
assert.equal(api.extractGoogleMapsUrl(mobileShortLink), mobileShortLink);
assert.throws(() => api.parseGoogleMapsUrl(mobileShortLink, 'https://www.google.com/maps/place/GMW9%2B85F+Samut+Prakan/data=!4m2!3m1!1s0x311d59aa7931d64b:0xf7df1f418b15e240'), /ไม่พบพิกัด/, 'some real mobile share links provide a place name but no coordinates');
assert.throws(() => api.extractGoogleMapsUrl('https://maps.google.com.evil.test/maps'), /Google Maps/);

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

const unnamedPin = api.parseGoogleMapsUrl(
  'https://maps.app.goo.gl/zPtnoAEaapYwpBQSA',
  'https://www.google.com/maps/search/13.734960,+100.761462?entry=tts'
);
assert.equal(unnamedPin.googleName, 'สถานที่จาก Google Maps');
assert.equal(unnamedPin.lat, 13.73496);
assert.equal(unnamedPin.lng, 100.761462);
assert.ok(unnamedPin.navigationUrl.includes('destination=13.73496,100.761462'));

assert.throws(() => api.parseGoogleMapsUrl('https://example.com/maps/@13,100'));
assert.throws(() => api.parseGoogleMapsUrl('https://www.google.com/maps/place/no-coordinates'));
console.log('PASS: Google Maps URLs are validated, cleaned and converted to navigation coordinates');
