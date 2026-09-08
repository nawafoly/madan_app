import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HabatApiError,
  friendlyHabatError,
  readBrowserLocation,
} from "./habatAttendanceClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readBrowserLocation", () => {
  it("returns the first fresh high-accuracy GPS reading without starting a watch", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 24.7136,
          longitude: 46.6753,
          accuracy: 12,
        },
      } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(readBrowserLocation(true)).resolves.toEqual({
      latitude: 24.7136,
      longitude: 46.6753,
      accuracyM: 12,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  });
});

describe("friendlyHabatError", () => {
  it("includes the reported GPS accuracy and configured maximum", () => {
    expect(
      friendlyHabatError(
        new HabatApiError(422, "habat_location_accuracy_too_low", {
          accuracyM: 151,
          maxAccuracyM: 150,
        })
      )
    ).toBe(
      "دقة الموقع الحالية ±151م، والحد المسموح ±150م. انتظر تحسن إشارة GPS وحاول مجددًا."
    );
  });

  it("keeps the existing message when diagnostic values are absent", () => {
    expect(
      friendlyHabatError(
        new HabatApiError(422, "habat_location_accuracy_too_low")
      )
    ).toBe("دقة الموقع غير كافية. انتظر تحسن إشارة GPS وحاول مجددًا.");
  });
});
