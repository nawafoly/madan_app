import {
  createDefaultSiteMediaSettings,
  normalizeSiteMediaSettings,
  type SiteContentPageKey,
  type SiteLogoKey,
  type SiteMediaSettings,
} from "@/lib/siteContentMedia";
import { normalizePublicAssetPath } from "@/lib/publicAssets";

export type NextStepSliderSlide = {
  id: string;
  imageUrl: string;
  alt: string;
  linkUrl?: string;
  fileName?: string;
  filePath?: string;
  contentType?: string;
  uploadedAt?: string;
};

export type NextStepSliderSettings = {
  autoplayDelayMs: number;
  slides: NextStepSliderSlide[];
};

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
  nextStepSlider: NextStepSliderSettings;
  updatedAt?: unknown;
};

export const DEFAULT_NEXT_STEP_SLIDER_DELAY_MS = 5000;

export const DEFAULT_NEXT_STEP_SLIDER_SLIDES: NextStepSliderSlide[] = [
  {
    id: "default-projects",
    imageUrl: "/og.png",
    alt: "Maedin projects",
    linkUrl: "/projects",
  },
  {
    id: "default-about",
    imageUrl: "/about-poto1.jpg",
    alt: "Maedin platform",
    linkUrl: "/about",
  },
];

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
    nextStepSlider: createDefaultNextStepSliderSettings(),
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
    nextStepSlider: normalizeNextStepSliderSettings(source.nextStepSlider),
  };
}

export function createDefaultNextStepSliderSettings(): NextStepSliderSettings {
  return {
    autoplayDelayMs: DEFAULT_NEXT_STEP_SLIDER_DELAY_MS,
    slides: DEFAULT_NEXT_STEP_SLIDER_SLIDES,
  };
}

export function normalizeNextStepSliderSettings(
  value: unknown
): NextStepSliderSettings {
  const defaults = createDefaultNextStepSliderSettings();
  const source =
    value && typeof value === "object"
      ? (value as Partial<NextStepSliderSettings>)
      : {};
  const delay = Number(source.autoplayDelayMs);
  const slides = Array.isArray(source.slides)
    ? source.slides
        .map((slide, index) => normalizeNextStepSlide(slide, index))
        .filter((slide): slide is NextStepSliderSlide => Boolean(slide))
    : defaults.slides;

  return {
    autoplayDelayMs: Number.isFinite(delay)
      ? Math.min(Math.max(Math.round(delay), 1500), 60000)
      : defaults.autoplayDelayMs,
    slides: slides.length ? slides : defaults.slides,
  };
}

function normalizeNextStepSlide(
  value: unknown,
  index: number
): NextStepSliderSlide | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<NextStepSliderSlide>;
  const imageUrl = normalizePublicAssetPath(source.imageUrl || "", "");
  if (!imageUrl) return null;

  return {
    id: String(source.id || `slide-${index + 1}`).trim() || `slide-${index + 1}`,
    imageUrl,
    alt: String(source.alt || `Next step slide ${index + 1}`).trim(),
    linkUrl: String(source.linkUrl || "").trim(),
    fileName: source.fileName,
    filePath: source.filePath,
    contentType: source.contentType,
    uploadedAt: source.uploadedAt,
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
