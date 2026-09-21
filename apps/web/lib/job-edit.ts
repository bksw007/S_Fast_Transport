import type { JobPlace, TransportJob } from "@s-fast-transport/shared";

export type JobEditDraft = {
  customer: string;
  jobDate: string;
  cargoType: string;
  vehicleType: string;
  tripCount: string;
  driverId: string;
  vehiclePlate: string;
  pickupLocation: string;
  pickupPlace?: JobPlace;
  pickupDate: string;
  pickupTime: string;
  pickupContactId: string;
  pickupContact: string;
  pickupContactPhone: string;
  pickupContactNotes: string;
  deliveryLocation: string;
  deliveryPlace?: JobPlace;
  deliveryDate: string;
  deliveryTime: string;
  deliveryContactId: string;
  deliveryContact: string;
  deliveryContactPhone: string;
  deliveryContactNotes: string;
  eta: string;
  notes: string;
};

export type ValidatedJobEdit = Omit<JobEditDraft, "tripCount"> & { tripCount: number };

export function jobToEditDraft(job: Partial<TransportJob>): JobEditDraft {
  return {
    customer: String(job.customer ?? ""),
    jobDate: String(job.jobDate ?? ""),
    cargoType: String(job.cargoType ?? ""),
    vehicleType: String(job.vehicleType ?? ""),
    tripCount: String(job.tripCount ?? 1),
    driverId: String(job.driverId ?? ""),
    vehiclePlate: String(job.vehiclePlate ?? ""),
    pickupLocation: String(job.pickupLocation ?? ""),
    pickupPlace: job.pickupPlace,
    pickupDate: String(job.pickupDate ?? ""),
    pickupTime: String(job.pickupTime ?? ""),
    pickupContactId: String(job.pickupContactId ?? ""),
    pickupContact: String(job.pickupContact ?? ""),
    pickupContactPhone: String(job.pickupContactPhone ?? ""),
    pickupContactNotes: String(job.pickupContactNotes ?? ""),
    deliveryLocation: String(job.deliveryLocation ?? ""),
    deliveryPlace: job.deliveryPlace,
    deliveryDate: String(job.deliveryDate ?? ""),
    deliveryTime: String(job.deliveryTime ?? ""),
    deliveryContactId: String(job.deliveryContactId ?? ""),
    deliveryContact: String(job.deliveryContact ?? ""),
    deliveryContactPhone: String(job.deliveryContactPhone ?? ""),
    deliveryContactNotes: String(job.deliveryContactNotes ?? ""),
    eta: String(job.eta ?? ""),
    notes: String(job.notes ?? "")
  };
}

function clean(value: string, label: string, maximum: number, required = false) {
  const result = value.trim().replace(/\s+/g, " ");
  if (required && !result) throw new Error(`กรุณาระบุ${label}`);
  if (result.length > maximum) throw new Error(`${label}ต้องไม่เกิน ${maximum} ตัวอักษร`);
  return result;
}

function date(value: string, label: string, required = false) {
  const result = value.trim();
  if (required && !result) throw new Error(`กรุณาระบุ${label}`);
  if (result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`${label}ไม่ถูกต้อง`);
  return result;
}

function time(value: string, label: string) {
  const result = value.trim();
  if (result && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error(`${label}ไม่ถูกต้อง`);
  return result;
}

function contact(nameValue: string, phoneValue: string, label: string) {
  const name = clean(nameValue, `ผู้ติดต่อ${label}`, 160);
  const phone = phoneValue.trim();
  if ((name || phone) && (!name || !/^[+\d()\s-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.length > 40)) {
    throw new Error(`กรุณาระบุชื่อและเบอร์โทรผู้ติดต่อ${label}ให้ครบถ้วน`);
  }
  return { name, phone };
}

export function validateJobEditDraft(draft: JobEditDraft): ValidatedJobEdit {
  const tripCount = Number(draft.tripCount);
  if (!Number.isInteger(tripCount) || tripCount < 1 || tripCount > 999) throw new Error("จำนวนรอบต้องอยู่ระหว่าง 1–999");
  const pickupContact = contact(draft.pickupContact, draft.pickupContactPhone, "จุดรับ");
  const deliveryContact = contact(draft.deliveryContact, draft.deliveryContactPhone, "จุดส่ง");
  return {
    customer: clean(draft.customer, "บริษัทผู้ว่าจ้าง", 200, true),
    jobDate: date(draft.jobDate, "วันที่รับงาน", true),
    cargoType: clean(draft.cargoType, "ประเภทสินค้า", 160),
    vehicleType: clean(draft.vehicleType, "ประเภทรถ", 160),
    tripCount,
    driverId: draft.driverId.trim(),
    vehiclePlate: clean(draft.vehiclePlate, "ทะเบียนรถ", 160),
    pickupLocation: clean(draft.pickupLocation, "สถานที่รับสินค้า", 160, true),
    pickupPlace: draft.pickupPlace,
    pickupDate: date(draft.pickupDate, "วันที่รับ"),
    pickupTime: time(draft.pickupTime, "เวลารับ"),
    pickupContactId: draft.pickupContactId.trim(),
    pickupContact: pickupContact.name,
    pickupContactPhone: pickupContact.phone,
    pickupContactNotes: clean(draft.pickupContactNotes, "หมายเหตุผู้ติดต่อจุดรับ", 500),
    deliveryLocation: clean(draft.deliveryLocation, "สถานที่ส่งสินค้า", 160, true),
    deliveryPlace: draft.deliveryPlace,
    deliveryDate: date(draft.deliveryDate, "วันที่ส่ง"),
    deliveryTime: time(draft.deliveryTime, "เวลาส่ง"),
    deliveryContactId: draft.deliveryContactId.trim(),
    deliveryContact: deliveryContact.name,
    deliveryContactPhone: deliveryContact.phone,
    deliveryContactNotes: clean(draft.deliveryContactNotes, "หมายเหตุผู้ติดต่อจุดส่ง", 500),
    eta: clean(draft.eta, "กำหนดถึง", 100),
    notes: draft.notes.trim().slice(0, 2000)
  };
}
