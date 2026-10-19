import type { JobPlace, ReturnTrip, TransportJob } from "@s-fast-transport/shared";

export function initialReturnTrip(job: Pick<TransportJob, "pickupLocation" | "pickupPlace" | "pickupDate" | "pickupTime" | "pickupContact" | "pickupContactId" | "pickupContactPhone" | "pickupContactNotes" | "deliveryLocation" | "deliveryPlace" | "deliveryDate" | "deliveryTime" | "deliveryContact" | "deliveryContactId" | "deliveryContactPhone" | "deliveryContactNotes">): ReturnTrip {
  return {
    pickupLocation: job.deliveryLocation, pickupPlace: job.deliveryPlace,
    pickupDate: job.deliveryDate || "", pickupTime: "",
    pickupContact: job.deliveryContact || "", pickupContactId: job.deliveryContactId || "",
    pickupContactPhone: job.deliveryContactPhone || "", pickupContactNotes: job.deliveryContactNotes || "",
    deliveryLocation: job.pickupLocation, deliveryPlace: job.pickupPlace,
    deliveryDate: job.deliveryDate || "", deliveryTime: "",
    deliveryContact: job.pickupContact || "", deliveryContactId: job.pickupContactId || "",
    deliveryContactPhone: job.pickupContactPhone || "", deliveryContactNotes: job.pickupContactNotes || ""
  };
}

type OutwardStops = Pick<TransportJob, "pickupLocation" | "pickupPlace" | "deliveryLocation" | "deliveryPlace" | "returnTrip">;

export function updateOutwardStop<T extends OutwardStops>(job: T, stop: "pickup" | "delivery", location: string, place?: JobPlace): T {
  const previousLocation = job[`${stop}Location`];
  const returnStop = stop === "pickup" ? "delivery" : "pickup";
  const returnTrip = job.returnTrip && job.returnTrip[`${returnStop}Location`] === previousLocation
    ? { ...job.returnTrip, [`${returnStop}Location`]: location, [`${returnStop}Place`]: place }
    : job.returnTrip;
  return { ...job, [`${stop}Location`]: location, [`${stop}Place`]: place, returnTrip };
}

// Older jobs may have been saved before the outward destination was selected.
export function driverReturnTrip(job: TransportJob): ReturnTrip | undefined {
  const trip = job.returnTrip;
  if (!trip) return undefined;
  if (job.pickupLocation.trim() === job.deliveryLocation.trim() || trip.pickupLocation.trim() !== trip.deliveryLocation.trim()) return trip;
  const reversed = initialReturnTrip(job);
  return {
    ...trip,
    pickupLocation: reversed.pickupLocation, pickupPlace: reversed.pickupPlace,
    pickupContact: reversed.pickupContact, pickupContactId: reversed.pickupContactId,
    pickupContactPhone: reversed.pickupContactPhone, pickupContactNotes: reversed.pickupContactNotes,
    deliveryLocation: reversed.deliveryLocation, deliveryPlace: reversed.deliveryPlace,
    deliveryContact: reversed.deliveryContact, deliveryContactId: reversed.deliveryContactId,
    deliveryContactPhone: reversed.deliveryContactPhone, deliveryContactNotes: reversed.deliveryContactNotes
  };
}

function scheduled(date: string, time: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`กรุณาระบุวันและเวลา${label}ให้ครบถ้วน`);
  const value = Date.parse(`${date}T${time}:00+07:00`);
  if (!Number.isFinite(value)) throw new Error(`วันและเวลา${label}ไม่ถูกต้อง`);
  return value;
}

function cleanContact(name: string | undefined, phone: string | undefined, label: string) {
  const cleanedName = (name || "").trim();
  const cleanedPhone = (phone || "").trim();
  if ((cleanedName || cleanedPhone) && (!cleanedName || !/^[+\d()\s-]+$/.test(cleanedPhone) || cleanedPhone.replace(/\D/g, "").length < 7 || cleanedPhone.length > 40)) throw new Error(`กรุณาระบุชื่อและเบอร์โทรผู้ติดต่อ${label}ให้ครบถ้วน`);
  return { name: cleanedName, phone: cleanedPhone };
}

export function validateReturnTrip(trip: ReturnTrip | undefined, outwardDeliveryDate: string, outwardDeliveryTime: string): ReturnTrip | undefined {
  if (!trip) return undefined;
  const pickupLocation = trip.pickupLocation.trim();
  const deliveryLocation = trip.deliveryLocation.trim();
  if (!pickupLocation || !deliveryLocation || pickupLocation.length > 160 || deliveryLocation.length > 160) throw new Error("กรุณาระบุจุดรับและจุดส่งสินค้าขากลับ");
  const outwardDelivery = scheduled(outwardDeliveryDate, outwardDeliveryTime, "ส่งสินค้าขาไป");
  const returnPickup = scheduled(trip.pickupDate, trip.pickupTime, "รับสินค้าขากลับ");
  const returnDelivery = scheduled(trip.deliveryDate, trip.deliveryTime, "ส่งสินค้าขากลับ");
  if (returnPickup < outwardDelivery) throw new Error("เวลารับสินค้าขากลับต้องไม่ก่อนเวลาส่งสินค้าขาไป");
  if (returnDelivery < returnPickup) throw new Error("เวลาส่งสินค้าขากลับต้องไม่ก่อนเวลารับสินค้าขากลับ");
  const pickup = cleanContact(trip.pickupContact, trip.pickupContactPhone, "จุดรับขากลับ");
  const delivery = cleanContact(trip.deliveryContact, trip.deliveryContactPhone, "จุดส่งขากลับ");
  const place = (value?: JobPlace) => value ? { ...value } : undefined;
  return {
    pickupLocation, ...(trip.pickupPlace ? { pickupPlace: place(trip.pickupPlace) } : {}),
    pickupDate: trip.pickupDate, pickupTime: trip.pickupTime,
    pickupContact: pickup.name, pickupContactId: trip.pickupContactId || "", pickupContactPhone: pickup.phone, pickupContactNotes: (trip.pickupContactNotes || "").trim().slice(0, 500),
    deliveryLocation, ...(trip.deliveryPlace ? { deliveryPlace: place(trip.deliveryPlace) } : {}),
    deliveryDate: trip.deliveryDate, deliveryTime: trip.deliveryTime,
    deliveryContact: delivery.name, deliveryContactId: trip.deliveryContactId || "", deliveryContactPhone: delivery.phone, deliveryContactNotes: (trip.deliveryContactNotes || "").trim().slice(0, 500)
  };
}

export function activeLeg(job: Pick<TransportJob, "returnTrip" | "activeLeg">): 1 | 2 {
  return job.returnTrip && job.activeLeg === 2 ? 2 : 1;
}
