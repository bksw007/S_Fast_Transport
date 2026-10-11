import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

export const linkJobToCustomer = onDocumentWritten({
  document: "today_jobs/{jobId}",
  region: "asia-southeast1"
}, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || after.customerId || (before && before.customer === after.customer)) return;
  const normalized = String(after.customer ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
  if (!normalized) return;
  const indexed = await db.doc(`customer_names/${encodeURIComponent(normalized)}`).get();
  let customerId = indexed.exists ? String(indexed.data()?.customerId ?? "") : "";
  if (!customerId) {
    const customers = await db.collection("customers").get();
    const matches = customers.docs.filter(item => {
      const data = item.data();
      return [data.name, ...(Array.isArray(data.aliases) ? data.aliases : [])]
        .some(name => String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH") === normalized);
    });
    if (matches.length === 1) customerId = matches[0].id;
  }
  if (customerId) await event.data?.after.ref.update({ customerId });
});
