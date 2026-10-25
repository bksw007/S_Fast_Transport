const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const contactUserId = `U${'a'.repeat(32)}`;
const documents = new Map([
  ['today_jobs/job-1', { workOrder: 'JN-1', driverName: 'คนขับ', vehiclePlate: '72-2211', assignedDriverUid: 'driver-1', organizationId: 'partner', originOrganizationId: 'main', trackingShareToken: 'abcdef0123456789abcdef0123456789' }],
  ['organizations/main', { lineNotificationsEnabled: true }],
  ['organizations/partner', { lineUserId: contactUserId }]
]);
const requests = [];
let responseStatus = 200;
let uuidCount = 0;
const db = {
  collection(name) {
    return {
      doc(id) {
        const path = `${name}/${id}`;
        return {
          path,
          get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }),
          update: async patch => { documents.set(path, { ...documents.get(path), ...patch }); }
        };
      }
    };
  },
  runTransaction: async action => action({
    get: async ref => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
    create: (ref, data) => { documents.set(ref.path, data); }
  })
};
class Timestamp {}
const context = {
  exports: {},
  fetch: async (_url, options) => {
    requests.push(options);
    return { ok: responseStatus === 200, status: responseStatus, text: async () => 'temporary error' };
  },
  require(name) {
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'NOW' }, getFirestore: () => db, Timestamp };
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'TEST_TOKEN' }) };
    if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: (_options, handler) => handler };
    if (name === 'firebase-functions') return { logger: { error() {} } };
    if (name === 'node:crypto') return { randomUUID: () => `123e4567-e89b-12d3-a456-${String(++uuidCount).padStart(12, '0')}` };
    throw new Error(`Unexpected import ${name}`);
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('functions-line/src/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);

(async () => {
  const driverEvent = { params: { eventId: 'event-1' }, data: { data: () => ({
    type: 'driver_issue', jobId: 'job-1', actorName: 'นายทดสอบ',
    metadata: { issueType: 'vehicle_breakdown', note: 'รถสตาร์ตไม่ติด', photoPath: 'proof_of_delivery/photo.jpg' }
  }) } };
  await context.exports.notifyLineGroupOfDriverIssue(driverEvent);
  const driverMessage = JSON.parse(requests[0].body).messages[0].text;
  assert.match(driverMessage, /🚨 คนขับแจ้งปัญหา · รอดำเนินการ/);
  assert.match(driverMessage, /ใบงาน: JN-1/);
  assert.match(driverMessage, /คนขับ: นายทดสอบ/);
  assert.match(driverMessage, /รถ: 72-2211/);
  assert.match(driverMessage, /ปัญหา: รถเสีย/);
  assert.match(driverMessage, /รูปประกอบ: มี/);
  assert.equal(JSON.parse(requests[0].body).to, 'Cad5367471fd1c5487eac65af79417742');
  await context.exports.notifyLineGroupOfDriverIssue(driverEvent);
  assert.equal(requests.length, 1, 'a retried event must not send a duplicate');

  const customerEvent = { params: { requestId: 'request-1' }, data: { data: () => ({
    status: 'pending', customerName: 'บริษัททดสอบ', requesterName: 'คุณลูกค้า',
    pickupPlace: { name: 'โกดัง A' }, pickupDate: '2026-10-16', pickupTime: '09:00',
    deliveryPlace: { name: 'โรงงาน B' }, deliveryDate: '2026-10-16', deliveryTime: '13:00',
    cargoType: 'แผ่นเหล็ก', vehicleType: '6 ล้อ', notes: 'เข้าประตู 2'
  }) } };
  await context.exports.notifyLineGroupOfCustomerRequest(customerEvent);
  const customerMessage = JSON.parse(requests[1].body).messages[0].text;
  assert.match(customerMessage, /📦 คำขอแจ้งงานใหม่ · รอพิจารณา/);
  assert.match(customerMessage, /บริษัท: บริษัททดสอบ/);
  assert.match(customerMessage, /รับสินค้า: โกดัง A · 16\/10\/2569 09:00/);
  assert.match(customerMessage, /ส่งสินค้า: โรงงาน B · 16\/10\/2569 13:00/);
  assert.match(customerMessage, /สินค้า: แผ่นเหล็ก/);
  assert.match(customerMessage, /รถที่ต้องการ: 6 ล้อ/);
  await context.exports.notifyLineGroupOfCustomerRequest(customerEvent);
  assert.equal(requests.length, 2, 'a retried request must not send a duplicate');

  responseStatus = 429;
  const retryEvent = { params: { requestId: 'request-2' }, data: customerEvent.data };
  await assert.rejects(context.exports.notifyLineGroupOfCustomerRequest(retryEvent), /LINE push failed: 429/);
  responseStatus = 200;
  await context.exports.notifyLineGroupOfCustomerRequest(retryEvent);
  assert.equal(requests[2].headers['X-Line-Retry-Key'], requests[3].headers['X-Line-Retry-Key'], 'retry must reuse the same LINE key');
  assert.equal(documents.get('line_event_notifications/customer_request_request-2').status, 'sent');
  const acceptedEvent = { params: { eventId: 'partner-accepted' }, data: { data: () => ({ type: 'subcontract_accepted', jobId: 'job-1' }) } };
  await context.exports.notifyLineGroupOfSubcontractAssignment(acceptedEvent);
  assert.equal(requests.length, 4, 'accepting a subcontract job must not use LINE quota');
  const subcontractEvent = { params: { eventId: 'partner-1' }, data: { data: () => ({ type: 'subcontract_assigned', jobId: 'job-1' }) } };
  await context.exports.notifyLineGroupOfSubcontractAssignment(subcontractEvent);
  assert.match(JSON.parse(requests[4].body).messages[0].text, /บริษัทซับมอบหมายรถและคนขับแล้ว/);
  assert.match(JSON.parse(requests[4].body).messages[0].text, /ใบงาน: JN-1/);
  assert.equal(JSON.parse(requests[4].body).to, 'Cad5367471fd1c5487eac65af79417742');
  assert.equal(JSON.parse(requests[5].body).to, contactUserId);
  assert.match(JSON.parse(requests[5].body).messages[0].text, /รถ: 72-2211\nคนขับ: คนขับ/);
  assert.match(JSON.parse(requests[5].body).messages[0].text, /\/track\/abcdef0123456789abcdef0123456789/);
  await context.exports.notifyLineGroupOfSubcontractAssignment(subcontractEvent);
  await context.exports.notifyLineGroupOfSubcontractAssignment({ ...subcontractEvent, params: { eventId: 'partner-duplicate' } });
  assert.equal(requests.length, 6, 'a retried or duplicate assignment must not send twice to either recipient');
  documents.set('organizations/main', { lineNotificationsEnabled: false });
  const disabledEvent = { params: { requestId: 'request-disabled' }, data: customerEvent.data };
  await context.exports.notifyLineGroupOfCustomerRequest(disabledEvent);
  assert.equal(requests.length, 6, 'disabled LINE must not push customer requests');
  assert.equal(documents.get('line_event_notifications/customer_request_request-disabled').status, 'disabled');
  const disabledAssignment = { params: { eventId: 'partner-disabled' }, data: subcontractEvent.data };
  await context.exports.notifyLineGroupOfSubcontractAssignment(disabledAssignment);
  assert.equal(requests.length, 6, 'disabled LINE must not push to group or subcontract contact');
  documents.set('organizations/main', { lineNotificationsEnabled: true });
  await context.exports.notifyLineGroupOfCustomerRequest(disabledEvent);
  assert.equal(requests.length, 6, 're-enabling LINE must not send an old skipped request');
  console.log('PASS: LINE event notifications send once to each intended recipient');
})().catch(error => { console.error(error); process.exitCode = 1; });
