# Firebase Data Model

## Collections

### users

- `role`: `owner | admin | dispatcher | driver`
- `displayName`
- `phone`
- `active`

### today_jobs

Hot collection for active daily jobs. The dashboard should read this first.

- `assignedDriverUid`
- `status`
- `pickupLocation`
- `deliveryLocation`
- `trackingEnabled`
- `trackingStartedAt`
- `trackingEndedAt`
- `currentLocation.lat`
- `currentLocation.lng`
- `currentLocation.speed`
- `currentLocation.heading`
- `currentLocation.accuracy`
- `currentLocation.updatedAt`
- `trackingStatus`

### job_locations/{jobId}/points

Append-only route history. Drivers can create points for their assigned job but cannot edit history.

- `driverUid`
- `lat`
- `lng`
- `speed`
- `heading`
- `accuracy`
- `batteryLevel`
- `timestamp`
- `source`: `gps | manual | background | offline_sync`

### job_events

Timeline for operations, customer support, and dispute resolution.

- `jobId`
- `type`
- `message`
- `actorUid`
- `actorName`
- `lat`
- `lng`
- `timestamp`
- `metadata`

### driver_live_status

Fast map overview per driver.

- `currentJobId`
- `driverName`
- `vehiclePlate`
- `lat`
- `lng`
- `speed`
- `heading`
- `isOnline`
- `isTracking`
- `lastUpdatedAt`
- `batteryLevel`

## Tracking Frequency

- No accepted job: no tracking
- Accepted but parked: every 3-5 minutes
- Moving: every 15-30 seconds or when movement exceeds 100 meters
- Stationary: every 2-5 minutes
- Completed: stop immediately

## Privacy Rules

- Track location only for accepted jobs.
- Stop tracking when a job is completed.
- Admin can view route history only for relevant jobs.
- Driver UI must always show whether tracking is active.
