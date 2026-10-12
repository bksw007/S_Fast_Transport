const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash } = require('node:crypto');

const records = new Map();
const writes = [];
const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(ref(path)), set: async data => { records.set(path, data); } });
const snapshot = item => ({ exists: records.has(item.path), data: () => records.get(item.path) });
const db = {
  doc: path => ref(path),
  collection: path => ({ doc: () => ref(`${path}/request-1`) }),
  runTransaction: async action => action({
    get: async item => snapshot(item),
    create(item, data) { if (records.has(item.path)) throw new Error('duplicate create'); writes.push({ path: item.path, data }); records.set(item.path, data); },
    update(item, data) { writes.push({ path: item.path, data }); records.set(item.path, { ...records.get(item.path), ...data }); }
  })
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const calls = [];
const context = {
  exports: {},
  require(name) {
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'SERVER_TIME' }, getFirestore: () => db };
    if (name === 'firebase-functions/v2/firestore') return { onDocumentWritten: (_options, handler) => handler };
    if (name === 'firebase-functions/v2/https') return { onCall: (_options, handler) => handler, HttpsError };
    if (name === 'firebase-functions/params') return { defineSecret: name => ({ value: () => name === 'CUSTOMER_REQUEST_GMAIL_ADDRESS' ? 'company@gmail.com' : 'test-app-password' }) };
    if (name === 'node:crypto') return { createHash };
    if (name === 'nodemailer') return { createTransport: options => {
      assert.equal(options.host, 'smtp.gmail.com');
      assert.equal(options.auth.user, 'company@gmail.com');
      return { sendMail: async message => { calls.push(message); return { messageId: `email-${calls.length}` }; } };
    } };
    throw new Error(`Unexpected import ${name}`);
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('functions-customer/src/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);

const place = { name: 'คลังสินค้า', lat: 13.75, lng: 100.5 };
const input = { pickupPlace: place, deliveryPlace: place, pickupDate: '2026-10-14', pickupTime: '09:00', deliveryDate: '2026-10-14', deliveryTime: '13:00', cargoType: 'สินค้า', vehicleType: 'รถหกล้อ', notes: '', recipientEmails: ['customer@example.com', 'other@example.com'] };
const customerAuth = { auth: { uid: 'customer-user', token: { email: 'customer@example.com' } }, data: input };
records.set('users/customer-user', { role: 'customer', active: true, approvalStatus: 'approved', customerId: 'customer-A', email: 'customer@example.com', fullName: 'ผู้แจ้ง' });
records.set('customers/customer-A', { name: 'บริษัท A', active: true });
records.set('organizations/main', { email: 'office@example.com' });
records.set('users/admin-user', { role: 'admin', active: true, approvalStatus: 'approved', organizationId: 'main' });

(async () => {
  const submitted = await context.exports.submitCustomerJobRequest(customerAuth);
  assert.equal(submitted.id, 'request-1');
  assert.equal(writes.filter(item => item.path.startsWith('customers/customer-A/locations/')).length, 1, 'same pickup and delivery pin creates one private record');
  assert.equal(writes.filter(item => item.path.startsWith('organizations/main/locations/')).length, 1, 'same pin creates one tagged main-company record');
  const request = records.get('customer_job_requests/request-1');
  assert.equal(request.customerId, 'customer-A');
  assert.equal(request.status, 'pending');
  assert.equal(request.pickupPlace.locationId, request.deliveryPlace.locationId);
  await assert.rejects(() => context.exports.submitCustomerJobRequest({ ...customerAuth, data: { ...input, recipientEmails: [] } }), /อีเมลผู้รับ/);
  await assert.rejects(() => context.exports.rejectCustomerJobRequest({ auth: { uid: 'customer-user' }, data: { id: 'request-1', reason: 'ไม่รับ' } }), /เฉพาะผู้ดูแล/);
  await context.exports.emailCustomerJobRequest({ params: { requestId: 'request-1' }, data: { before: { data: () => undefined }, after: { data: () => request } } });
  assert.equal(calls.length, 1, 'submission sends one message');
  assert.equal(calls[0].to, 'office@example.com', 'main company receives the email directly');
  assert.deepEqual(Array.from(calls[0].bcc), ['customer@example.com', 'other@example.com'], 'selected customer recipients receive a private copy');
  await context.exports.emailCustomerJobRequest({ params: { requestId: 'request-1' }, data: { before: { data: () => undefined }, after: { data: () => request } } });
  assert.equal(calls.length, 1, 'delivery log prevents duplicate email');
  await context.exports.rejectCustomerJobRequest({ auth: { uid: 'admin-user' }, data: { id: 'request-1', reason: 'รถไม่พร้อม' } });
  const rejected = records.get('customer_job_requests/request-1');
  assert.equal(rejected.status, 'rejected');
  await context.exports.emailCustomerJobRequest({ params: { requestId: 'request-1' }, data: { before: { data: () => request }, after: { data: () => rejected } } });
  assert.equal(calls.length, 2, 'decision mail reaches the same recipients');
  const accepted = { ...request, status: 'accepted', workOrder: 'JN-20261014001' };
  await context.exports.emailCustomerJobRequest({ params: { requestId: 'request-2' }, data: { before: { data: () => request }, after: { data: () => accepted } } });
  assert.equal(calls.length, 3, 'acceptance mail reaches every recipient too');
  assert.match(calls[2].text, /JN-20261014001/);
  console.log('PASS: customer request validation, two separate location stores, review permissions, and email recipients');
})().catch(error => { console.error(error); process.exitCode = 1; });
