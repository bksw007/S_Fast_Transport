import type { StopProof, TransportJob } from "@s-fast-transport/shared";
import { deliveryLabels, deliveryResult } from "./reports";
import { driverIssueLabels } from "./driver-issue-labels";

export type ReportProof = { photos: string[]; signature?: string };
export type CompletionReportJob = Pick<TransportJob,
  "status" | "workOrder" | "customer" | "carrierName" | "jobDate" | "cargoType" | "tripCount" |
  "pickupLocation" | "pickupDate" | "pickupTime" | "deliveryLocation" | "deliveryDate" | "deliveryTime" |
  "vehiclePlate" | "vehicleType" | "driverName" | "routeDistanceMeters" | "arrivedDeliveryAt" | "completedAt" | "returnTrip" | "returnArrivedDeliveryAt" | "historical" | "recordedAt"
> & { pickupProof?: Pick<StopProof, "signerName" | "signedAt">; deliveryProof?: Pick<StopProof, "signerName" | "signedAt">; returnPickupProof?: Pick<StopProof, "signerName" | "signedAt">; returnDeliveryProof?: Pick<StopProof, "signerName" | "signedAt">; lastIssue?: { type: string; note?: string; reportedAt?: string; resolvedAt?: string; resolutionNote?: string } };

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const text = (value: unknown) => value === undefined || value === null || value === "" ? "ไม่บันทึก" : escapeHtml(value);
const dateTime = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })
  : "ไม่บันทึก";
const schedule = (date?: string, time?: string) => date ? `${escapeHtml(date)}${time ? ` · ${escapeHtml(time)} น.` : ""}` : "ไม่บันทึก";

function detail(label: string, value: unknown) {
  return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${text(value)}</strong></div>`;
}

function evidence(title: string, location: string, proof: Pick<StopProof, "signerName" | "signedAt"> | undefined, images: ReportProof) {
  const photoCards = images.photos.length
    ? images.photos.map((url, index) => `<figure class="photo"><img src="${escapeHtml(url)}" alt="${escapeHtml(title)} ภาพ ${index + 1}"><figcaption>ภาพที่ ${index + 1}</figcaption></figure>`).join("")
    : `<p class="missing">ไม่มีภาพหลักฐาน</p>`;
  return `<section class="evidence page-break"><div class="section-label">หลักฐานการขนส่ง</div><h2>${escapeHtml(title)}</h2><p class="location">${escapeHtml(location)}</p><div class="photos">${photoCards}</div><div class="signoff"><div><span>ผู้ลงลายเซ็น</span><strong>${text(proof?.signerName)}</strong><small>ลงนาม ${dateTime(proof?.signedAt)}</small></div>${images.signature ? `<img src="${escapeHtml(images.signature)}" alt="ลายเซ็น ${escapeHtml(proof?.signerName || title)}">` : `<span class="missing">ไม่มีไฟล์ลายเซ็น</span>`}</div></section>`;
}

function historicalEvidence(title: string, photos: string[]) {
  return `<section class="evidence page-break"><div class="section-label">หลักฐานงานย้อนหลัง</div><h2>${escapeHtml(title)}</h2><div class="photos">${photos.length ? photos.map((url, index) => `<figure class="photo"><img src="${escapeHtml(url)}" alt="${escapeHtml(title)} ภาพ ${index + 1}"><figcaption>ภาพที่ ${index + 1}</figcaption></figure>`).join("") : `<p class="missing">ไม่ได้แนบรูป</p>`}</div></section>`;
}

export function completionReportHtml(job: CompletionReportJob, pickup: ReportProof, delivery: ReportProof, logoUrl: string, generatedAt = new Date(), returnEvidence?: { pickup: ReportProof; delivery: ReportProof }, issuePhotoUrl?: string, handoverDocumentPhotos: string[] = [], pastPhotos?: { pickup: string[]; delivery: string[]; document: string[] }): string {
  if (job.status !== "completed") throw new Error("สร้างรายงานลูกค้าได้เฉพาะใบงานที่เสร็จแล้ว");
  const reportDate = dateTime(generatedAt.toISOString());
  const result = deliveryResult(job, generatedAt.getTime());
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>รายงานการขนส่ง-${escapeHtml(job.workOrder)}</title><style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #17292c; background: #e9eeed; font-family: Tahoma, Arial, sans-serif; font-size: 12px; line-height: 1.55; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 22px; background: #173d3b; color: white; }
    .toolbar button { border: 0; border-radius: 8px; padding: 10px 18px; color: #173d3b; background: white; font: inherit; font-weight: 700; cursor: pointer; }
    .sheet { width: 210mm; min-height: 297mm; margin: 18px auto; padding: 14mm; background: white; box-shadow: 0 8px 30px #173d3b24; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 3px solid #1f5954; }
    .brand { display: flex; align-items: center; gap: 12px; } .brand img { width: 42px; height: 42px; object-fit: contain; } .brand strong { display: block; font-size: 17px; } .brand span, .meta { color: #667679; font-size: 10px; }
    .eyebrow, .section-label { color: #3a7871; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    h1 { margin: 20px 0 5px; font-size: 27px; line-height: 1.25; } h2 { margin: 7px 0; font-size: 20px; } p { margin: 0; }
    .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; } .hero .sub { color: #657477; font-size: 13px; }
    .badge { flex: none; margin-top: 22px; padding: 7px 12px; border-radius: 999px; background: #e3f2eb; color: #19604a; font-weight: 700; }
    .section { margin-top: 25px; } .section h3 { margin: 0 0 10px; font-size: 14px; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
    .detail { min-width: 0; padding: 10px 12px; border: 1px solid #dce6e4; border-radius: 9px; break-inside: avoid; } .detail span, .signoff span { display: block; color: #657477; font-size: 10px; } .detail strong { display: block; margin-top: 3px; overflow-wrap: anywhere; font-size: 12px; }
    .route { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .stop { padding: 14px; border-left: 4px solid #1f5954; background: #f1f6f4; border-radius: 5px 10px 10px 5px; } .stop small { display: block; color: #3a7871; font-weight: 700; } .stop strong { display: block; margin: 5px 0; overflow-wrap: anywhere; font-size: 15px; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #dce6e4; color: #718183; font-size: 10px; display: flex; justify-content: space-between; }
    .page-break { break-before: page; page-break-before: always; } .evidence { padding-top: 2mm; } .location { color: #657477; }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-top: 17px; } .photo { margin: 0; border: 1px solid #dce6e4; border-radius: 8px; padding: 5px; break-inside: avoid; } .photo img { display: block; width: 100%; height: 70mm; object-fit: contain; background: #f5f7f6; } figcaption { padding: 5px 4px 2px; color: #657477; font-size: 10px; }
    .signoff { display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-top: 20px; padding: 14px; border: 1px solid #dce6e4; border-radius: 9px; break-inside: avoid; } .signoff strong { display: block; margin-top: 4px; } .signoff small { display: block; margin-top: 4px; color: #657477; } .signoff img { max-width: 65mm; max-height: 28mm; object-fit: contain; } .missing { color: #9a5d35; }
    .issue { padding: 13px 15px; border: 1px solid #e2c6aa; border-left: 4px solid #b27642; border-radius: 8px; background: #fdf9f4; break-inside: avoid; } .issue.resolved { border-color: #dce6e4; border-left-color: #3a7871; background: #f4f8f6; } .issue strong { display: block; font-size: 13px; } .issue p { margin-top: 5px; overflow-wrap: anywhere; } .issue small { display: block; margin-top: 5px; color: #657477; } .issue img { display: block; max-width: 100%; max-height: 55mm; margin-top: 10px; border-radius: 6px; object-fit: contain; }
    @media print { body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .toolbar { display: none; } .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } .evidence { padding-top: 0; } }
    @media screen and (max-width: 800px) { .sheet { width: auto; min-height: 0; margin: 10px; padding: 20px; } .grid, .route, .photos { grid-template-columns: 1fr; } .photo img { height: 250px; } }
  </style></head><body><div class="toolbar"><span>ตัวอย่างรายงาน · ${escapeHtml(job.workOrder)}</span><button type="button" onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>
  <main class="sheet"><header class="head"><div class="brand"><img src="${escapeHtml(logoUrl)}" alt="S Fast Transport"><div><strong>S Fast Transport</strong><span>TRANSPORT COMPLETION REPORT</span></div></div><div class="meta">สร้างรายงาน ${reportDate}</div></header>
  <div class="hero"><div><p class="eyebrow">รายงานส่งมอบสินค้า${job.historical ? " · บันทึกย้อนหลัง" : ""}</p><h1>งานขนส่งเสร็จสมบูรณ์</h1><p class="sub">ใบงาน ${text(job.workOrder)} · ${text(job.customer)}</p></div><span class="badge">ส่งสำเร็จ</span></div>
  <section class="section"><h3>ข้อมูลใบงาน</h3><div class="grid">${detail("เลขที่ใบงาน", job.workOrder)}${detail("ลูกค้า", job.customer)}${detail("บริษัทขนส่ง", job.carrierName)}${detail("วันที่งาน", job.jobDate)}${detail("ประเภทสินค้า", job.cargoType)}${detail("จำนวนเที่ยว", job.tripCount || 1)}</div></section>
  <section class="section"><h3>${job.returnTrip ? "เที่ยวขาไป" : "เส้นทางและกำหนดการ"}</h3><div class="route"><div class="stop"><small>จุดรับสินค้า</small><strong>${text(job.pickupLocation)}</strong><span>กำหนดรับ ${schedule(job.pickupDate, job.pickupTime)}</span></div><div class="stop"><small>จุดส่งสินค้า</small><strong>${text(job.deliveryLocation)}</strong><span>กำหนดส่ง ${schedule(job.deliveryDate, job.deliveryTime)}</span></div></div></section>
  ${job.returnTrip ? `<section class="section"><h3>เที่ยวขากลับ · รับสินค้ากลับ</h3><div class="route"><div class="stop"><small>จุดรับสินค้าขากลับ</small><strong>${text(job.returnTrip.pickupLocation)}</strong><span>กำหนดรับ ${schedule(job.returnTrip.pickupDate, job.returnTrip.pickupTime)}</span></div><div class="stop"><small>จุดส่งสินค้าขากลับ</small><strong>${text(job.returnTrip.deliveryLocation)}</strong><span>กำหนดส่ง ${schedule(job.returnTrip.deliveryDate, job.returnTrip.deliveryTime)}</span></div></div></section>` : ""}
  <section class="section"><h3>รถและผู้ปฏิบัติงาน</h3><div class="grid">${detail("ทะเบียนรถ", job.vehiclePlate)}${detail("ประเภทรถ", job.vehicleType)}${detail("คนขับ", job.driverName)}${detail(job.returnTrip ? "ระยะทางขาไปโดยประมาณ" : "ระยะทางเส้นทางโดยประมาณ", job.routeDistanceMeters ? `${(job.routeDistanceMeters / 1000).toFixed(1)} กม.` : undefined)}</div></section>
  <section class="section"><h3>ผลการส่งมอบ</h3><div class="grid">${detail(job.returnTrip ? "ถึงจุดส่งขาไปจริง" : "ถึงจุดส่งจริง", dateTime(job.arrivedDeliveryAt))}${job.returnTrip ? detail("ถึงจุดส่งขากลับจริง", dateTime(job.returnArrivedDeliveryAt)) : ""}${detail("ปิดงาน", dateTime(job.completedAt))}${job.historical ? detail("บันทึกเข้าระบบ", dateTime(job.recordedAt)) : ""}${detail("ผลเทียบกำหนดส่งขาไป", deliveryLabels[result])}${job.historical ? detail("หลักฐานสินค้า", `จุดรับ ${pastPhotos?.pickup.length ?? 0} ภาพ · จุดลง ${pastPhotos?.delivery.length ?? 0} ภาพ`) : detail("หลักฐานขาไป", `จุดรับ ${pickup.photos.length} ภาพ · จุดส่ง ${delivery.photos.length} ภาพ`)}${job.returnTrip ? detail("หลักฐานขากลับ", `จุดรับ ${returnEvidence?.pickup.photos.length ?? 0} ภาพ · จุดส่ง ${returnEvidence?.delivery.photos.length ?? 0} ภาพ`) : ""}${job.historical ? detail("รูปเอกสาร", `${pastPhotos?.document.length ?? 0} ภาพ`) : detail("เอกสารนำส่ง", `${handoverDocumentPhotos.length} ภาพ`)}</div></section>
  ${job.lastIssue ? `<section class="section"><h3>ปัญหาที่คนขับแจ้ง</h3><div class="issue${job.lastIssue.resolvedAt ? " resolved" : ""}"><strong>${escapeHtml(driverIssueLabels[job.lastIssue.type] || "ปัญหาการขนส่ง")}</strong>${job.lastIssue.note ? `<p>${escapeHtml(job.lastIssue.note)}</p>` : ""}<small>แจ้งเมื่อ ${dateTime(job.lastIssue.reportedAt)} · ${job.lastIssue.resolvedAt ? `ดำเนินการแล้ว ${dateTime(job.lastIssue.resolvedAt)}` : "รอดำเนินการ"}</small>${job.lastIssue.resolutionNote ? `<p>การดำเนินการ: ${escapeHtml(job.lastIssue.resolutionNote)}</p>` : ""}${issuePhotoUrl ? `<img src="${escapeHtml(issuePhotoUrl)}" alt="ภาพประกอบปัญหาที่คนขับแจ้ง">` : ""}</div></section>` : ""}
  <footer class="footer"><span>${job.historical ? "รายงานจากข้อมูลและรูปหลักฐานที่ผู้ดูแลบันทึกย้อนหลัง" : "รายงานจากข้อมูลใบงานและหลักฐานที่บันทึกในระบบ"}</span><span>${text(job.workOrder)}</span></footer>
  ${job.historical ? `${historicalEvidence("รูปรับสินค้า", pastPhotos?.pickup ?? [])}${historicalEvidence("รูปลงสินค้า", pastPhotos?.delivery ?? [])}${historicalEvidence("รูปเอกสาร", pastPhotos?.document ?? [])}` : `${evidence("จุดรับสินค้า", job.pickupLocation, job.pickupProof, pickup)}${evidence("จุดส่งสินค้า", job.deliveryLocation, job.deliveryProof, delivery)}`}
  ${job.returnTrip ? `${evidence("จุดรับสินค้าขากลับ", job.returnTrip.pickupLocation, job.returnPickupProof, returnEvidence?.pickup ?? { photos: [] })}${evidence("จุดส่งสินค้าขากลับ", job.returnTrip.deliveryLocation, job.returnDeliveryProof, returnEvidence?.delivery ?? { photos: [] })}` : ""}
  ${handoverDocumentPhotos.length ? `<section class="evidence page-break"><div class="section-label">หลักฐานเพิ่มเติม</div><h2>เอกสารนำส่ง</h2><div class="photos">${handoverDocumentPhotos.map((url, index) => `<figure class="photo"><img src="${escapeHtml(url)}" alt="เอกสารนำส่ง ภาพ ${index + 1}"><figcaption>เอกสารนำส่ง ภาพที่ ${index + 1}</figcaption></figure>`).join("")}</div></section>` : ""}
  </main></body></html>`;
}
