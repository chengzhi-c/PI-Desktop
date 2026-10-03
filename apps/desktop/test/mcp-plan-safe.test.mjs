import assert from "node:assert/strict";
import test from "node:test";

import {
  missingPlanSafeTools,
  normalizePlanSafeTools,
  planSafeToolsError,
} from "../src/components/extensions/mcp-plan-safe.ts";

test("normalizePlanSafeTools trims names and rejects wildcards", () => {
  assert.deepEqual(normalizePlanSafeTools([" search-docs ", "get_page", ""]), [
    "search-docs",
    "get_page",
  ]);
  assert.equal(planSafeToolsError(["search*"]), "shape");
  assert.equal(
    planSafeToolsError(Array.from({ length: 33 }, (_, index) => `tool${index}`)),
    "count",
  );
  assert.throws(() => normalizePlanSafeTools(["search*"]), /MCP_INVALID/);
  assert.throws(
    () => normalizePlanSafeTools(Array.from({ length: 33 }, (_, index) => `tool${index}`)),
    /MCP_INVALID/,
  );
});

test("missingPlanSafeTools stays quiet until a test advertised names", () => {
  assert.deepEqual(missingPlanSafeTools(["lookup"], undefined), []);
  assert.deepEqual(missingPlanSafeTools(["lookup", "gone"], ["lookup", "ping"]), ["gone"]);
});
