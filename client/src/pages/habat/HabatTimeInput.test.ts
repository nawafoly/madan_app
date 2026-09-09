import { describe, expect, it } from "vitest";

import {
  formatHabatClockTime,
  formatHabatShiftRange,
  parseHabatTime,
  toHabat24HourTime,
} from "./HabatTimeInput";

describe("Habat 12-hour time UI", () => {
  it("formats HH:mm for 12-hour UI", () => {
    expect(formatHabatClockTime("00:00")).toBe("12:00 AM");
    expect(formatHabatClockTime("09:05")).toBe("09:05 AM");
    expect(formatHabatClockTime("12:00")).toBe("12:00 PM");
    expect(formatHabatClockTime("15:00")).toBe("03:00 PM");
    expect(formatHabatClockTime("23:59")).toBe("11:59 PM");
  });

  it("formats shift ranges", () => {
    expect(formatHabatShiftRange("09:00", "17:00"))
      .toBe("09:00 AM — 05:00 PM");

    expect(formatHabatShiftRange("15:00", "23:59"))
      .toBe("03:00 PM — 11:59 PM");
  });

  it("converts 12-hour input back to canonical HH:mm", () => {
    expect(toHabat24HourTime("12", "00", "AM")).toBe("00:00");
    expect(toHabat24HourTime("12", "00", "PM")).toBe("12:00");
    expect(toHabat24HourTime("03", "00", "PM")).toBe("15:00");
    expect(toHabat24HourTime("11", "59", "PM")).toBe("23:59");
  });

  it("parses stored HH:mm correctly", () => {
    expect(parseHabatTime("00:00")).toEqual({
      hour: "12",
      minute: "00",
      meridiem: "AM",
    });

    expect(parseHabatTime("12:00")).toEqual({
      hour: "12",
      minute: "00",
      meridiem: "PM",
    });

    expect(parseHabatTime("15:00")).toEqual({
      hour: "03",
      minute: "00",
      meridiem: "PM",
    });

    expect(parseHabatTime("")).toEqual({
      hour: "",
      minute: "",
      meridiem: "AM",
    });
  });
});