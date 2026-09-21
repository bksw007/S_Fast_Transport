const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const styles = fs.readFileSync('apps/web/app/styles.css', 'utf8');

assert.match(source, /importLibrary\("marker"\)/, 'loads the modern Google marker library');
assert.match(source, /AdvancedMarkerElement/, 'uses AdvancedMarkerElement instead of the deprecated marker');
assert.match(source, /driverPhotoUrl/, 'renders the current driver profile photo');
assert.match(source, /map-driver-marker-alert/, 'retains a visible alert badge');
assert.match(source, /mapId:\s*"DEMO_MAP_ID"/, 'uses a map id required by advanced markers');
assert.match(styles, /\.map-driver-marker-avatar/, 'styles the driver image as an avatar marker');
assert.match(styles, /\.map-driver-marker\.is-selected/, 'visually distinguishes the selected job');

console.log('PASS: Google map uses accessible driver photo advanced markers with alert and selected states');
