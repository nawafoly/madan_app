export const AVATAR_CROP_FRAME_INSET_RATIO = 0.09;

export type AvatarCropPosition = {
  x: number;
  y: number;
};

export type AvatarCropMetrics = {
  width: number;
  height: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

export type AvatarCroppedAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getAvatarCropMetrics(input: {
  naturalWidth: number;
  naturalHeight: number;
  viewportSize: number;
  zoom: number;
}) {
  const viewportSize = Math.max(1, input.viewportSize);
  const naturalWidth = Math.max(1, input.naturalWidth);
  const naturalHeight = Math.max(1, input.naturalHeight);
  const zoom = Math.max(input.zoom, 0.01);
  const coverScale = Math.max(
    viewportSize / naturalWidth,
    viewportSize / naturalHeight
  );
  const width = naturalWidth * coverScale * zoom;
  const height = naturalHeight * coverScale * zoom;

  return {
    width,
    height,
    maxOffsetX: Math.max(0, (width - viewportSize) / 2),
    maxOffsetY: Math.max(0, (height - viewportSize) / 2),
  } satisfies AvatarCropMetrics;
}

export function clampAvatarCropPosition(
  position: AvatarCropPosition,
  metrics: AvatarCropMetrics
) {
  return {
    x: clampNumber(position.x, -metrics.maxOffsetX, metrics.maxOffsetX),
    y: clampNumber(position.y, -metrics.maxOffsetY, metrics.maxOffsetY),
  } satisfies AvatarCropPosition;
}

export function getAvatarCropFrameRect(
  viewportSize: number,
  insetRatio = AVATAR_CROP_FRAME_INSET_RATIO
) {
  const inset = viewportSize * insetRatio;
  const size = viewportSize - inset * 2;

  return {
    x: inset,
    y: inset,
    size,
  };
}

export function getAvatarCroppedAreaPixels(input: {
  naturalWidth: number;
  naturalHeight: number;
  viewportSize: number;
  zoom: number;
  position: AvatarCropPosition;
  insetRatio?: number;
}) {
  const metrics = getAvatarCropMetrics(input);
  const position = clampAvatarCropPosition(input.position, metrics);
  const frame = getAvatarCropFrameRect(input.viewportSize, input.insetRatio);
  const imageLeft = (input.viewportSize - metrics.width) / 2 + position.x;
  const imageTop = (input.viewportSize - metrics.height) / 2 + position.y;
  const scaleX = input.naturalWidth / metrics.width;
  const scaleY = input.naturalHeight / metrics.height;

  const width = frame.size * scaleX;
  const height = frame.size * scaleY;
  const maxX = Math.max(0, input.naturalWidth - width);
  const maxY = Math.max(0, input.naturalHeight - height);

  return {
    x: clampNumber((frame.x - imageLeft) * scaleX, 0, maxX),
    y: clampNumber((frame.y - imageTop) * scaleY, 0, maxY),
    width,
    height,
  } satisfies AvatarCroppedAreaPixels;
}
