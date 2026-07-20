# Firebase Data Model

## Tenant boundary

Every tenant-owned operational document uses `organizationId`. The main company uses `main`; subcontract companies use stable generated IDs. Main admins can cross tenant boundaries, subcontract admins are restricted to their organization, and drivers are additionally restricted to assigned jobs.

## Collections

### users/{uid}

- `email`
- `displayName`
- `photoURL`: รูปโปรไฟล์จากบัญชี Google
- `role`: `owner | admin | dispatcher | subcontract_admin | driver`
- `active`
- `approvalStatus`: `pending | approved | suspended`
- `organizationId`: `main | {subcontractId} | null`
- `organizationType`: `main | subcontract | null`
- `organizationName`
- `organizationLogoUrl`
- `authProvider`: `google.com`
- `accessRequestName`, `accessRequestMessage`, `accessRequestSubmittedAt`
- `approvedByUid`
- `approvedAt`

New users may create only their own pending/inactive Google profile. Main admins perform approval and assignment.

### organizations/{organizationId}

- `type`: `main | subcontract`
- `name`
- `taxId`
- `contactName`
- `phone`
- `email`
- `logoUrl`
- `active`
- `createdAt`
- `updatedAt`

### organizations/{organizationId}/list_options/{field--normalizedValue}

รายการกลางสำหรับคอมโบบ็อกซ์ในฟอร์มใบงาน แยกตามบริษัท แอดมินบริษัทหลัก (`owner | admin | dispatcher`, `organizationId: main`) จัดการได้ทุกหมวดและทุกบริษัท ส่วนแอดมินบริษัทรองจัดการข้อมูลปฏิบัติงานได้ทุกหมวด แต่เฉพาะ `organizationId` ตัวเองเท่านั้น

- `organizationId`
- `field`: `customer | cargo_type | vehicle_type | location | contact | employee | driver | vehicle_plate`
- `value`, `normalizedValue`
- `createdByUid`, `updatedByUid`
- `createdAt`, `updatedAt`

### today_jobs/{jobId}

Hot collection for the active dashboard.

- `organizationId`
- `carrierName`
- `workOrder`, `jobDate`, `cargoType`, `vehicleType`, `tripCount`
- `pickupLocation`, `pickupDate`, `pickupTime`, `pickupContact`
- `deliveryLocation`, `deliveryDate`, `deliveryTime`, `deliveryContact`
- `assignedEmployee`, `driverName`, `driverPhone`, `vehiclePlate`
- `notes`
- `assignedDriverUid`
- `status`
- `pickupLocation`
- `deliveryLocation`
- `trackingEnabled`
- `trackingStartedAt`
- `trackingEndedAt`
- `currentLocation.{lat,lng,speed,heading,accuracy,updatedAt}`
- `trackingStatus`

### vehicles/{organizationId--normalizedPlate}

- `organizationId`, `plate`, `plateNormalized`
- `vehicleType`, `brand`, `model`, `capacityKg`
- `registrationExpiry`, `insuranceExpiry`, `gpsDeviceId`
- `status`: `available | assigned | maintenance | inactive`
- `createdByUid`, `updatedByUid`, `createdAt`, `updatedAt`

### drivers/{organizationId--normalizedLicenseNumber}

- `organizationId`, `name`, `phone`, `email`
- `licenseNumber`, `licenseType`, `licenseExpiry`
- `assignedVehicleId`
- `status`: `available | assigned | leave | inactive`
- `createdByUid`, `updatedByUid`, `createdAt`, `updatedAt`

### job_locations/{jobId}/points/{pointId}

Append-only route history. Assigned drivers may create points and cannot edit them.

- `driverUid`
- `lat`, `lng`, `speed`, `heading`, `accuracy`
- `batteryLevel`
- `timestamp`
- `source`: `gps | manual | background | offline_sync`

### job_events/{eventId}

- `jobId`
- `organizationId`
- `type`, `message`
- `actorUid`, `actorName`
- `lat`, `lng`, `timestamp`, `metadata`

### proof_of_delivery/{podId}

- `jobId`
- `organizationId`
- `uploadedByUid`, `uploadedByName`
- `fileName`, `storagePath`, `downloadUrl`
- `contentType`, `size`, `createdAt`

### tracking_share_links/{token}

This is a public, customer-safe projection; it must not require a public read of `today_jobs`.

- `jobId`
- `organizationId`
- `enabled`
- `expiresAt`
- `workOrder`
- `customerName`
- `statusLabel`
- `pickupLocation`, `deliveryLocation`
- `vehicleLabel`, `carrierName`
- `eta`, `lastUpdatedAt`
- `currentLocation.{lat,lng}` (optional)

Do not include driver personal phone numbers, internal notes, costs, or unrelated jobs.

## Tracking privacy

- Track only for accepted, active jobs.
- Stop immediately when completed or cancelled.
- A driver always sees whether tracking is active.
- Tenant admins see only their organization.
- Public links expose only one job projection and expire automatically.
