import {
  createDefaultSiteMediaSettings,
  normalizeSiteMediaSettings,
  type SiteContentPageKey,
  type SiteLogoKey,
  type SiteMediaSettings,
} from "@/lib/siteContentMedia";
import { normalizePublicAssetPath } from "@/lib/publicAssets";

export type SiteContentSettings = {
  heroTitleAr: string;
  heroTitleEn: string;
  heroSubtitleAr: string;
  heroSubtitleEn: string;
  footerAboutAr: string;
  footerAboutEn: string;
  contactEmail: string;
  contactPhone: string;
  media: SiteMediaSettings;
  updatedAt?: unknown;
};

export function createDefaultSiteContentSettings(): SiteContentSettings {
  return {
    heroTitleAr: "منصة معدن البناء",
    heroTitleEn: "MAEDIN Platform",
    heroSubtitleAr: "استثمر بثقة مع فرص مدروسة",
    heroSubtitleEn: "Invest with confidence in curated opportunities",
    footerAboutAr:
      "معدن البناء منصة لإتاحة فرص استثمارية بشكل احترافي.",
    footerAboutEn:
      "MAEDIN is a platform for curated investment opportunities.",
    contactEmail: "",
    contactPhone: "",
    media: createDefaultSiteMediaSettings(),
  };
}

export function normalizeSiteContentSettings(
  value: unknown
): SiteContentSettings {
  const defaults = createDefaultSiteContentSettings();
  const source =
    value && typeof value === "object"
      ? (value as Partial<SiteContentSettings>)
      : {};

  return {
    ...defaults,
    ...source,
    media: normalizeSiteMediaSettings(source.media),
  };
}

export function getSiteLogoUrl(
  content: SiteContentSettings,
  key: SiteLogoKey,
  fallback = "/logo.png"
) {
  return normalizePublicAssetPath(content.media.logos[key]?.url, fallback) || fallback;
}

export function getSiteLogoAlt(
  content: SiteContentSettings,
  key: SiteLogoKey,
  fallback = "MAEDIN logo"
) {
  return String(content.media.logos[key]?.alt || fallback).trim();
}

export function getSitePageMediaUrl(
  content: SiteContentSettings,
  pageKey: SiteContentPageKey,
  fieldId: string,
  fallback: string
) {
  return (
    normalizePublicAssetPath(content.media.pages[pageKey]?.[fieldId]?.url, fallback) ||
    fallback
  );
}

export function getSitePageMediaAlt(
  content: SiteContentSettings,
  pageKey: SiteContentPageKey,
  fieldId: string,
  fallback: string
) {
  return String(content.media.pages[pageKey]?.[fieldId]?.alt || fallback).trim();
}
