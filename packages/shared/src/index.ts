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

export type TransportJob = {
  id: string;
  workOrder: string;
  customer: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  pickupLocation: string;
  deliveryLocation: string;
  status: JobStatus;
  trackingStatus: TrackingStatus;
  trackingEnabled: boolean;
  eta: string;
  lastUpdatedMinutes: number;
  currentLocation: LocationPoint;
  alerts: string[];
  organizationId?: string;
  carrierName?: string;
};

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
  "ลูกค้า",
  "Reports",
  "แจ้งเตือน",
  "User Management",
  "โปรไฟล์",
  "Settings"
] as const;

export const driverMenu = [
  "งานวันนี้",
  "กำลังขนส่ง",
  "แผนที่งานของฉัน",
  "อัปเดตหลักฐาน",
  "ประวัติงาน",
  "โปรไฟล์"
] as const;

export const sampleJobs: TransportJob[] = [
  {
    id: "JOB-260625-014",
    workOrder: "WO-10483",
    customer: "บริษัท เอเชีย ฟู้ดส์",
    driverName: "สมชาย ใจดี",
    driverPhone: "081-555-0134",
    vehiclePlate: "70-4581 ชลบุรี",
    pickupLocation: "คลังสินค้า บางนา กม.18",
    deliveryLocation: "โรงงาน นวนคร",
    status: "to_delivery",
    trackingStatus: "on_the_way_to_delivery",
    trackingEnabled: true,
    eta: "10:42",
    lastUpdatedMinutes: 1,
    currentLocation: {
      lat: 13.7563,
      lng: 100.5018,
      speed: 68,
      heading: 42,
      accuracy: 8,
      updatedAt: "2026-06-25T09:56:00+07:00"
    },
    alerts: []
  },
  {
    id: "JOB-260625-018",
    workOrder: "WO-10491",
    customer: "Kerry Cold Chain",
    driverName: "นิรันดร์ พรมดี",
    driverPhone: "089-221-7790",
    vehiclePlate: "83-7214 กรุงเทพ",
    pickupLocation: "ลาดกระบัง",
    deliveryLocation: "อมตะซิตี้ ระยอง",
    status: "arrived_pickup",
    trackingStatus: "arrived_pickup",
    trackingEnabled: true,
    eta: "12:05",
    lastUpdatedMinutes: 14,
    currentLocation: {
      lat: 13.7214,
      lng: 100.7851,
      speed: 0,
      heading: 90,
      accuracy: 11,
      updatedAt: "2026-06-25T09:43:00+07:00"
    },
    alerts: ["ตำแหน่งไม่อัปเดตเกิน 10 นาที", "รถหยุดนานผิดปกติ"]
  },
  {
    id: "JOB-260625-021",
    workOrder: "WO-10502",
    customer: "Siam Retail DC",
    driverName: "กิตติ ศรีสุข",
    driverPhone: "086-420-8881",
    vehiclePlate: "72-1130 สมุทรปราการ",
    pickupLocation: "พระประแดง",
    deliveryLocation: "เมกา บางนา",
    status: "to_pickup",
    trackingStatus: "on_the_way_to_pickup",
    trackingEnabled: true,
    eta: "10:18",
    lastUpdatedMinutes: 3,
    currentLocation: {
      lat: 13.6632,
      lng: 100.533,
      speed: 42,
      heading: 17,
      accuracy: 7,
      updatedAt: "2026-06-25T09:54:00+07:00"
    },
    alerts: []
  }
];

export const timelineEvents: TimelineEvent[] = [
  {
    id: "evt-1",
    time: "08:10",
    title: "Admin สร้างงาน",
    detail: "สร้างใบงาน WO-10483 และกำหนดจุดรับ/ส่ง",
    actor: "Admin"
  },
  {
    id: "evt-2",
    time: "08:22",
    title: "Driver รับงาน",
    detail: "คนขับยืนยันรับงานและเปิด tracking",
    actor: "สมชาย"
  },
  {
    id: "evt-3",
    time: "09:05",
    title: "ถึงจุดรับ",
    detail: "เข้า geofence คลังสินค้า บางนา กม.18",
    actor: "ระบบ"
  },
  {
    id: "evt-4",
    time: "09:35",
    title: "ออกจากจุดรับ",
    detail: "แนบรูปต้นทาง 3 รูปแล้วเริ่มเดินทางไปปลายทาง",
    actor: "สมชาย"
  }
];
