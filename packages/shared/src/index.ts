export type JobStatus =
  | "assigned"
  | "accepted"
  | "to_pickup"
  | "arrived_pickup"
  | "loading"
  | "to_delivery"
  | "arrived_delivery"
  | "unloading"
  | "ready_to_close"
  | "completed"
  | "cancelled"
  | "problem";

export type TrackingStatus =
  | "not_started"
  | "on_the_way_to_pickup"
  | "arrived_pickup"
  | "loading"
  | "on_the_way_to_delivery"
  | "arrived_delivery"
  | "unloading"
  | "completed";

export type LocationPoint = {
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy: number;
  updatedAt: string;
};

export type JobPlace = {
  locationId?: string;
  name: string;
  googleName?: string;
  originalMapsUrl: string;
  navigationUrl: string;
  lat: number;
  lng: number;
  googlePlaceId?: string;
};

export type TransportJob = {
  id: string;
  workOrder: string;
  customer: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  pickupLocation: string;
  deliveryLocation: string;
  pickupContact?: string;
  pickupContactId?: string;
  pickupContactPhone?: string;
  pickupContactNotes?: string;
  deliveryContact?: string;
  deliveryContactId?: string;
  deliveryContactPhone?: string;
  deliveryContactNotes?: string;
  pickupPlace?: JobPlace;
  deliveryPlace?: JobPlace;
  routeDistanceMeters?: number;
  routeDistanceFingerprint?: string;
  routeDistanceProvider?: "google_routes";
  routeDistanceCalculatedAt?: string;
  status: JobStatus;
  trackingStatus: TrackingStatus;
  trackingEnabled: boolean;
  eta: string;
  lastUpdatedMinutes: number;
  currentLocation: LocationPoint;
  alerts: string[];
  organizationId?: string;
  carrierName?: string;
  cargoType?: string;
  vehicleType?: string;
  driverId?: string;
  jobDate?: string;
  pickupDate?: string;
  pickupTime?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  arrivedDeliveryAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  issuePreviousStatus?: JobStatus;
  lastIssue?: {
    type: DriverIssueType;
    note?: string;
    reportedAt?: string;
    resolvedAt?: string;
    resolvedBy?: string;
    resolutionNote?: string;
    photoUrl?: string;
    photoPath?: string;
  };
  pickupProof?: StopProof;
  deliveryProof?: StopProof;
  assignedDriverUid?: string;
  driverPhotoUrl?: string;
  tripCount?: number;
  notes?: string;
};

export type DriverIssueType = "accident" | "traffic" | "heavy_rain" | "vehicle_breakdown" | "road_closed" | "contact_failed" | "loading_delay" | "customer_absent" | "signature_refused" | "photo_unavailable" | "goods_damaged" | "other";
export type StopProof = { photoPaths: string[]; signaturePath: string; signerName: string; signedAt: string };

export type HistoryStatusFilter = "all" | "completed" | "cancelled";

export function jobHistoryDate(job: Pick<TransportJob, "status" | "completedAt" | "cancelledAt" | "jobDate" | "deliveryDate" | "pickupDate">): string | undefined {
  return [job.status === "cancelled" ? job.cancelledAt : job.completedAt, job.status === "cancelled" ? job.completedAt : job.cancelledAt, job.jobDate, job.deliveryDate, job.pickupDate]
    .find(value => value && !Number.isNaN(new Date(value).getTime()));
}

export function jobHistoryMonth(job: Parameters<typeof jobHistoryDate>[0]): string {
  const value = jobHistoryDate(job);
  if (!value) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const date = new Date(value);
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return `${bangkok.getUTCFullYear()}-${String(bangkok.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function historyMonthLabel(month: string): string {
  if (month === "unknown") return "ไม่ระบุเดือน";
  const date = new Date(`${month}-01T12:00:00`);
  return Number.isNaN(date.getTime()) ? "ไม่ระบุเดือน" : date.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

export function filterDriverHistory(jobs: TransportJob[], status: HistoryStatusFilter, month: string): TransportJob[] {
  return jobs.filter(job => (job.status === "completed" || job.status === "cancelled")
    && (status === "all" || job.status === status)
    && (month === "all" || jobHistoryMonth(job) === month))
    .sort((a, b) => {
      const aTime = Date.parse(jobHistoryDate(a) ?? "");
      const bTime = Date.parse(jobHistoryDate(b) ?? "");
      return ((Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)) || b.id.localeCompare(a.id);
    });
}

export type TimelineEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  actor: string;
};

export const statusLabels: Record<JobStatus, string> = {
  assigned: "มอบหมายแล้ว",
  accepted: "รับงานแล้ว",
  to_pickup: "กำลังไปจุดรับ",
  arrived_pickup: "ถึงจุดรับ",
  loading: "กำลังโหลดสินค้า",
  to_delivery: "กำลังไปจุดส่ง",
  arrived_delivery: "ถึงจุดส่ง",
  unloading: "กำลังลงสินค้า",
  ready_to_close: "พร้อมปิดงาน",
  completed: "เสร็จงาน",
  cancelled: "ยกเลิก",
  problem: "มีปัญหา"
};

export const driverActions = [
  { id: "start_tracking", label: "เริ่มแชร์ตำแหน่ง", nextStatus: "accepted" },
  { id: "arrived_pickup", label: "ถึงจุดรับสินค้า", nextStatus: "arrived_pickup" },
  { id: "loading", label: "เริ่มขนสินค้า", nextStatus: "loading" },
  { id: "to_delivery", label: "ออกจากจุดรับ", nextStatus: "to_delivery" },
  { id: "arrived_delivery", label: "ถึงจุดส่งสินค้า", nextStatus: "arrived_delivery" },
  { id: "unloading", label: "ส่งของเสร็จ", nextStatus: "ready_to_close" },
  { id: "completed", label: "จบงาน", nextStatus: "completed" }
] as const;

export const adminMenu = [
  "Dashboard",
  "Jobs / ใบงาน",
  "Live Tracking",
  "บริษัทขนส่ง",
  "รถและคนขับ",
  "ตั้งค่าพิกัดแผนที่",
  "ลูกค้า",
  "Reports",
  "แจ้งเตือน",
  "User Management",
  "โปรไฟล์",
  "Settings",
  "สมุดรายชื่อ"
] as const;

export const driverMenu = [
  "งานวันนี้",
  "กำลังขนส่ง",
  "แผนที่งานของฉัน",
  "อัปเดตหลักฐาน",
  "ประวัติงาน",
  "โปรไฟล์"
] as const;
