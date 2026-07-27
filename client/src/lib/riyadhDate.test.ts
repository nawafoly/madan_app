import { describe, expect, it } from "vitest";

import { getRiyadhDateKey } from "./riyadhDate";

describe("Riyadh attendance date", () => {
  it("moves the date to the next Riyadh day after local midnight", () => {
    expect(getRiyadhDateKey("2026-07-26T21:30:00.000Z")).toBe("2026-07-27");
  });

  it("keeps the verified attendance record on July 27 in Riyadh", () => {
    expect(getRiyadhDateKey("2026-07-27T12:55:27.502Z")).toBe("2026-07-27");
  });

  it("returns an empty value for invalid timestamps", () => {
    expect(getRiyadhDateKey("not-a-date")).toBe("");
  });
});
