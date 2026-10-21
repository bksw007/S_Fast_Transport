const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const calls = [];
const photo = { name: 'photo.jpg', type: 'image/jpeg', size: 180_000 };
const signature = { type: 'image/png', size: 37_377 };
let signatureAttempts = 0;
let photoCompleted = false;
const storageApi = {
  ref: (_storage, path) => ({ path }),
  uploadBytesResumable: target => {
    calls.push(`resumable:${target.path}`);
    return { cancel() {}, on(_event, progress, _error, complete) { queueMicrotask(() => { progress({ bytesTransferred: target.path.endsWith('.png') ? signature.size : photo.size }); complete(); }); } };
  },
  uploadBytes: async target => {
    calls.push(`simple:${target.path}`);
    if (!target.path.endsWith('signature.png')) {
      await new Promise(resolve => setTimeout(resolve, 5));
      photoCompleted = true;
      return;
    }
    assert.equal(photoCompleted, true, 'signature waits for the photo upload');
    if (target.path.endsWith('signature.png') && ++signatureAttempts === 1) {
      throw Object.assign(new Error('network interrupted'), { code: 'storage/unknown' });
    }
  },
  getDownloadURL: async target => `https://example.test/${target.path}`,
};
const firestore = {
  collection: (_db, name) => name,
  doc: collection => ({ id: 'proof-1', path: `${collection}/proof-1` }),
  serverTimestamp: () => 'SERVER_TIME',
  writeBatch: () => ({ set() {}, commit: async () => { calls.push('commit'); } }),
  setDoc: async () => {},
};
const context = {
  exports: {},
  crypto: { randomUUID: () => 'upload-1' },
  window: { setTimeout, clearTimeout },
  navigator: { onLine: true },
  require: name => {
    if (name === 'firebase/storage') return storageApi;
    if (name === 'firebase/firestore') return firestore;
    if (name === './image-upload') return { compressImageForUpload: async file => file, isImageFile: file => file.type.startsWith('image/'), MAX_SOURCE_IMAGE_BYTES: 20_000_000, MAX_STORED_IMAGE_BYTES: 1_048_576 };
    if (name === '@s-fast-transport/shared') return { statusLabels: {} };
    return { db: {}, storage: {} };
  },
};
const source = fs.readFileSync('apps/web/lib/transport-repository.ts', 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);

(async () => {
  const result = await context.exports.uploadStopProof({ id: 'job-1', organizationId: 'main' }, 'delivery', [photo], signature, 'Recipient', { uid: 'driver-1', displayName: 'Driver', organizationId: 'main' });
  assert.deepEqual(calls.map(item => item.split(':')[0]), ['simple', 'simple', 'simple', 'commit']);
  assert.equal(signatureAttempts, 2, 'a transient signature failure is retried');
  assert.equal(result.signaturePath, 'proof_of_delivery/job-1/driver-1/upload-1-delivery-signature.png');
  console.log('PASS: proof assets upload one at a time and retry a transient signature failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
