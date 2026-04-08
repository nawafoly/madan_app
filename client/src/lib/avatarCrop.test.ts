import { describe, expect, it } from "vitest";

import {
  clampAvatarCropPosition,
  getAvatarCroppedAreaPixels,
  getAvatarCropFrameRect,
  getAvatarCropMetrics,
} from "@/lib/avatarCrop";

describe("avatarCrop", () => {
  const baseInput = {
    naturalWidth: 1200,
    naturalHeight: 800,
    viewportSize: 320,
    zoom: 1,
  };

  it("maps the far-right drag to the left edge of the source image", () => {
    const metrics = getAvatarCropMetrics(baseInput);
    const frame = getAvatarCropFrameRect(baseInput.viewportSize);
    const position = clampAvatarCropPosition(
      { x: metrics.maxOffsetX, y: 0 },
      metrics
    );
    const croppedArea = getAvatarCroppedAreaPixels({
      ...baseInput,
      position,
    });

    expect(croppedArea.x).toBeCloseTo(
      (frame.x * baseInput.naturalWidth) / metrics.width,
      4
    );
  });

  it("maps the far-left drag to the right edge of the source image", () => {
    const metrics = getAvatarCropMetrics(baseInput);
    const frame = getAvatarCropFrameRect(baseInput.viewportSize);
    const position = clampAvatarCropPosition(
      { x: -metrics.maxOffsetX, y: 0 },
      metrics
    );
    const croppedArea = getAvatarCroppedAreaPixels({
      ...baseInput,
      position,
    });

    expect(croppedArea.x + croppedArea.width).toBeCloseTo(
      baseInput.naturalWidth -
        (frame.x * baseInput.naturalWidth) / metrics.width,
      4
    );
  });

  it("maps top and bottom drags to the matching source bounds", () => {
    const metrics = getAvatarCropMetrics(baseInput);
    const frame = getAvatarCropFrameRect(baseInput.viewportSize);
    const topPosition = clampAvatarCropPosition(
      { x: 0, y: metrics.maxOffsetY },
      metrics
    );
    const bottomPosition = clampAvatarCropPosition(
      { x: 0, y: -metrics.maxOffsetY },
      metrics
    );
    const topCrop = getAvatarCroppedAreaPixels({
      ...baseInput,
      position: topPosition,
    });
    const bottomCrop = getAvatarCroppedAreaPixels({
      ...baseInput,
      position: bottomPosition,
    });

    expect(topCrop.y).toBeCloseTo(
      (frame.y * baseInput.naturalHeight) / metrics.height,
      4
    );
    expect(bottomCrop.y + bottomCrop.height).toBeCloseTo(
      baseInput.naturalHeight -
        (frame.y * baseInput.naturalHeight) / metrics.height,
      4
    );
  });

  it("reduces the saved crop area when zoom increases", () => {
    const cropAtDefaultZoom = getAvatarCroppedAreaPixels({
      ...baseInput,
      zoom: 1,
      position: { x: 0, y: 0 },
    });
    const cropAtHigherZoom = getAvatarCroppedAreaPixels({
      ...baseInput,
      zoom: 2,
      position: { x: 0, y: 0 },
    });

    expect(cropAtHigherZoom.width).toBeLessThan(cropAtDefaultZoom.width);
    expect(cropAtHigherZoom.height).toBeLessThan(cropAtDefaultZoom.height);
  });
});
