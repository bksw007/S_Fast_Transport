# App Structure

## Admin

- Dashboard
- Live Tracking
- Jobs / ใบงาน
- Map View
- Job History
- Drivers
- Vehicles
- Locations
- Customers
- Reports
- Settings
- User Management

## Driver

- งานวันนี้
- กำลังขนส่ง
- แผนที่งานของฉัน
- อัปเดตหลักฐาน
- ประวัติงาน
- โปรไฟล์

## Core Workflows

1. Admin creates job.
2. Admin assigns driver.
3. Driver receives push notification.
4. Driver accepts job.
5. App asks whether to enable tracking for this job.
6. Driver starts route to pickup.
7. App updates location in real time.
8. Driver confirms pickup arrival and uploads evidence.
9. Driver starts route to delivery.
10. Admin follows vehicle on map.
11. Driver confirms delivery arrival and uploads POD.
12. Driver completes job.
13. App stops tracking and writes route history.
