export const PROJECT_IMAGE_FALLBACK = "/HOOM-HERO.png";

export function pickAssetPath(...values: unknown[]) {
  for (const value of values) {
    if (!value) continue;

    if (typeof value === "string") {
      const clean = value.trim();
      if (clean) return clean;
      continue;
    }

    if (Array.isArray(value)) {
      const fromArray = pickAssetPath(...value);
      if (fromArray) return fromArray;
      continue;
    }

    if (typeof value === "object") {
      const item = value as Record<string, unknown>;
      const fromObject = pickAssetPath(
        item.coverImage,
        item.coverImageUrl,
        item.heroImage,
        item.imageUrl,
        item.image,
        item.url,
        item.src,
        item.fileUrl,
        item.downloadUrl,
        item.path
      );
      if (fromObject) return fromObject;
    }
  }

  return "";
}

export function normalizePublicAssetPath(src?: unknown, fallback = "") {
  let value = pickAssetPath(src);
  if (!value) return "";

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return value;
  }

  value = value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^(\.\.\/)+public\//, "")
    .replace(/^client\/public\//, "")
    .replace(/^public\//, "");

  if (value.startsWith("/")) return value.replace(/^\/+/, "/");
  if (/^[^/?#]+\.(png|jpe?g|webp|gif|svg|mp4|webm)([?#].*)?$/i.test(value)) {
    return `/${value}`;
  }

  return fallback;
}

export function normalizeProjectImagePath(src?: unknown) {
  return normalizePublicAssetPath(src, PROJECT_IMAGE_FALLBACK) || PROJECT_IMAGE_FALLBACK;
}
