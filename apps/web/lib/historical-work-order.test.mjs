import assert from "node:assert/strict";
import { test } from "node:test";
import { historicalWorkOrder } from "./historical-work-order.ts";

test("historical numbers follow pickup date and keep their separate suffix", () => {
  assert.equal(historicalWorkOrder("2026-09-18", 1), "JN-20260918001PE");
  assert.equal(historicalWorkOrder("2026-09-18", 2), "JN-20260918002PE");
  assert.equal(historicalWorkOrder("2026-09-19", 1), "JN-20260919001PE");
  assert.throws(() => historicalWorkOrder("2026-09-18", 0));
});
