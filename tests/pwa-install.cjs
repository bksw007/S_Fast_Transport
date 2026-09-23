const assert = require('node:assert/strict');
const fs = require('node:fs');

const component = fs.readFileSync('apps/web/app/components/PwaInstallButton.tsx', 'utf8');
const page = fs.readFileSync('apps/web/app/page.tsx', 'utf8');
const manifest = JSON.parse(fs.readFileSync('apps/web/public/manifest.json', 'utf8'));

assert.match(component, /beforeinstallprompt/, 'captures the Chromium install event');
assert.match(component, /preventDefault\(\)/, 'defers the browser prompt for the in-app button');
assert.match(component, /deferredPrompt\.prompt\(\)/, 'opens the saved browser installation prompt');
assert.match(component, /appinstalled/, 'hides the action after installation');
assert.match(component, /savedInstallPrompt/, 'keeps an early prompt until the authenticated header mounts');
assert.match(component, /display-mode: standalone/, 'does not show install inside the installed app');
assert.match(component, /เพิ่มลงในหน้าจอหลัก/, 'provides a manual installation fallback');
assert.match(component, /aria-label="ติดตั้งแอป"/, 'install action is accessible');
assert.match(page, /<PwaInstallButton\s*\/>/, 'top bar exposes the install action');
assert.match(page, /preparePwaInstallPromptCapture\(\)/, 'captures installability before authentication finishes');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));

console.log('PASS: browser mode exposes a resilient PWA installation action');
