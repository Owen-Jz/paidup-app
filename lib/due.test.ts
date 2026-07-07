import { test } from "node:test";
import assert from "node:assert/strict";
import { dueMeta } from "./due.ts";

const NOW = Date.parse("2026-07-06T12:00:00Z");
const daysFromNow = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

test("future due date → 'Due in Nd', not overdue", () => {
  assert.deepEqual(dueMeta(daysFromNow(7), NOW), { label: "Due in 7d", overdue: false, days: 7 });
});

test("past due date → 'Overdue by Nd', overdue true", () => {
  assert.deepEqual(dueMeta(daysFromNow(-3), NOW), { label: "Overdue by 3d", overdue: true, days: -3 });
});

test("due today → 'Due today', not overdue", () => {
  assert.deepEqual(dueMeta(daysFromNow(0), NOW), { label: "Due today", overdue: false, days: 0 });
});

test("missing or invalid date → empty label, not overdue", () => {
  assert.deepEqual(dueMeta(undefined, NOW), { label: "", overdue: false, days: 0 });
  assert.deepEqual(dueMeta("not-a-date", NOW), { label: "", overdue: false, days: 0 });
});
