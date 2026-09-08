import { afterEach, describe, expect, it, vi } from "vitest";

import { readBrowserLocation } from "./habatAttendanceClient";

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
