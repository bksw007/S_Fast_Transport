# App Structure

## Main-company admin

Main-company admins can operate across every organization.

- Dashboard (default screen after admin login)
- Jobs / ใบงาน
- Live Tracking
- บริษัทขนส่ง
- รถและคนขับ
- ลูกค้าและลิงก์ติดตาม
- Reports
- แจ้งเตือน
- User Management / Google access approval
- Settings

## Subcontract-company admin

Subcontract admins see only records whose `organizationId` matches their profile.

- Dashboard (default screen after admin login)
- Jobs / ใบงาน
- Live Tracking
- รถและคนขับ
- Reports
- แจ้งเตือน
- Settings / ข้อมูลบริษัท

They cannot open main-company user management, customer management, or other subcontract companies.

## Driver

Drivers see and update only jobs assigned to their Firebase UID.

- งานวันนี้
- กำลังขนส่ง
- แผนที่งานของฉัน
- อัปเดตหลักฐาน
- ประวัติงาน
- โปรไฟล์

## Customer

Customers do not log in. A customer receives an expiring `/track/{token}` link containing a safe, denormalized snapshot of one job. It includes status, origin, destination, ETA, carrier, vehicle label, and optional current coordinates. It excludes driver phone numbers, other jobs, internal reports, and costs.

## Authentication and approval

1. A user signs in with Google.
2. A first-time profile is created as inactive with `approvalStatus: pending`.
3. A main-company admin assigns the role, `organizationId`, and organization type.
4. Only approved and active profiles can read operational data.
5. Menu visibility and Firebase rules both enforce the same role boundary.

## Core workflow

1. Main admin creates or registers a subcontract organization.
2. Main admin approves Google accounts and assigns them to an organization.
3. Main admin creates a job and assigns it to the main company or a subcontract company.
4. The relevant admin assigns a driver from that company.
5. Driver accepts and executes the job in sequence.
6. Admin follows the job and receives alerts.
7. A customer can follow one job through an expiring share link.
8. Driver completes the job and tracking stops.
