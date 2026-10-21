const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('apps/web/lib/image-upload.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

class LoadedImage {
  naturalWidth = 1200;
  naturalHeight = 900;
  set src(_) { queueMicrotask(() => this.onload?.()); }
  decode() { return Promise.reject(new Error('iOS decode rejected a displayable camera image')); }
}

const context = {
  exports: {},
  Image: LoadedImage,
  URL: { createObjectURL: () => 'blob:camera-photo', revokeObjectURL: () => {} },
};
vm.runInNewContext(code, context);

(async () => {
  const photo = { name: 'IMG_1234.jpeg', type: 'image/jpeg', size: 500_000 };
  assert.equal(await context.exports.compressImageForUpload(photo), photo);
  console.log('PASS: a camera image that loads still uploads when decode() rejects');
})().catch(error => { console.error(error); process.exitCode = 1; });
