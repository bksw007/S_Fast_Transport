import type { TransportJob } from "@s-fast-transport/shared";
import { formatPhoneNumber } from "@/lib/profile-repository";
export default function JobContacts({ job }: { job: TransportJob }) {
  return <div className="job-contacts">{([ ["จุดรับสินค้า", job.pickupContact, job.pickupContactPhone, job.pickupContactNotes], ["จุดส่งสินค้า", job.deliveryContact, job.deliveryContactPhone, job.deliveryContactNotes] ]).map(([label, name, phone, notes]) => <section key={label}><small>ผู้ติดต่อ{label}</small><strong>{name || "ยังไม่ระบุผู้ติดต่อ"}</strong>{phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>โทร {formatPhoneNumber(phone)}</a>}{notes && <p>{notes}</p>}</section>)}</div>;
}
