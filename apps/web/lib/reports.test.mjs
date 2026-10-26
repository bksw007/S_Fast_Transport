import assert from "node:assert/strict";
import { test } from "node:test";
import { filterReportJobs, reportCompanyKey } from "./reports.ts";

test("historical jobs filter by the carrier selected in the form", () => {
  const job = {
    historical: true, carrierOrganizationId: "sub-a", organizationId: "main", carrierName: "Sub A",
    pickupDate: "2026-09-18", workOrder: "JN-20260918001PE", customer: "Customer",
    driverName: "Driver", vehiclePlate: "AB-123", pickupLocation: "Pickup", deliveryLocation: "Delivery", status: "completed"
  };
  const filters = { start: "2026-09-01", end: "2026-09-30", organization: "sub-a", customer: "", search: "", status: "" };
  assert.equal(reportCompanyKey(job), "sub-a");
  assert.deepEqual(filterReportJobs([job], filters, Date.now()), [job]);
  assert.deepEqual(filterReportJobs([job], { ...filters, organization: "main" }, Date.now()), []);
});
