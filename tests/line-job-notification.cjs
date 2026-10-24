const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let request, state = {}, linkCreates = 0;
const contactUserId = `U${'a'.repeat(32)}`;
const db = {
  collection(name) {
    return {
      doc(id) {
        if (name === 'organizations') return { get: async () => ({ data: () => ({ name: 'Company', trackingLinkDays: 7, lineUserId: contactUserId }) }) };
        if (name === 'tracking_share_links') return {
          get: async () => ({ exists: true, data: () => ({ jobId: 'job-1' }) }),
          create: async () => { linkCreates++; }
        };
        if (name === 'line_job_notifications' || name === 'line_event_notifications') return {
          path: `${name}/${id}`,
          update: async patch => { state = { ...state, ...patch }; }
        };
        throw new Error(`Unexpected collection ${name}`);
      }
    };
  },
  runTransaction: async operation => operation({
    get: async () => ({ exists: false }),
    create: (_ref, data) => { state = data; }
  })
};
class Timestamp {}
const context = {
  exports: {},
  fetch: async (_url, options) => { request = options; return { ok: true, status: 200 }; },
  require(name) {
    if (name === 'firebase-admin/app') return { initializeApp() {} };
    if (name === 'firebase-admin/firestore') return { FieldValue: { serverTimestamp: () => 'NOW' }, getFirestore: () => db, Timestamp };
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'TEST_TOKEN' }) };
    if (name === 'firebase-functions/v2/firestore') return { onDocumentCreated: (_options, handler) => handler };
    if (name === 'firebase-functions') return { logger: { error() {} } };
    if (name === 'node:crypto') return { randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' };
    throw new Error(`Unexpected import ${name}`);
  }
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('functions-line/src/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);

(async () => {
  await context.exports.notifyLineGroupOfNewJob({ params: { jobId: 'job-1' }, data: { data: () => ({
    workOrder: 'JN-1', trackingShareToken: 'abcdef0123456789abcdef0123456789', organizationId: 'main', customer: 'ลูกค้า', driverName: 'คนขับ', pickupDate: '2026-10-15'
  }) } });
  const body = JSON.parse(request.body);
  assert.equal(body.to, 'Cad5367471fd1c5487eac65af79417742');
  assert.match(body.messages[0].text, /https:\/\/sfasttransport\.vercel\.app\/track\/abcdef0123456789abcdef0123456789/);
  assert.match(body.messages[0].text, /คนขับ: คนขับ\nวันที่รับสินค้า: 15\/10\/2569\nจุดรับ:/);
  assert.equal(linkCreates, 0, 'LINE must reuse the link created with the job');
  assert.equal(state.status, 'sent');
  await context.exports.notifyLineGroupOfNewJob({ params: { jobId: 'job-1' }, data: { data: () => ({ workOrder: 'JN-2', status: 'pending_subcontract', trackingShareToken: 'abcdef0123456789abcdef0123456789', organizationId: 'partner', carrierName: 'Partner', customer: 'ลูกค้า' }) } });
  assert.match(JSON.parse(request.body).messages[0].text, /มอบหมายให้บริษัท: Partner · รอรับงาน/);
  assert.doesNotMatch(JSON.parse(request.body).messages[0].text, /คนขับ:/);
  await context.exports.notifySubcontractContactOfNewJob({ params: { jobId: 'job-2' }, data: { data: () => ({
    workOrder: 'JN-2', trackingShareToken: 'abcdef0123456789abcdef0123456789', organizationId: 'partner', originOrganizationId: 'main', customer: 'ลูกค้า', pickupDate: '2026-10-15'
  }) } });
  const contactBody = JSON.parse(request.body);
  assert.equal(contactBody.to, contactUserId);
  assert.match(contactBody.messages[0].text, /มีใบงานใหม่ JN-2/);
  assert.doesNotMatch(contactBody.messages[0].text, /คนขับ:/);
  assert.match(contactBody.messages[0].text, /https:\/\/sfasttransport\.vercel\.app\/track\/abcdef0123456789abcdef0123456789/);
  assert.equal(state.status, 'sent');
  console.log('PASS: LINE group and subcontract contact notifications');
})().catch(error => { console.error(error); process.exitCode = 1; });
