export type SiteMediaType = "image" | "video";
export type SiteContentPageKey = "home" | "about" | "services" | "projects";
export type SiteLogoKey = "light" | "dark" | "footer" | "mark";

export type SiteMediaAsset = {
  url: string;
  alt: string;
  fileName?: string;
  filePath?: string;
  contentType?: string;
  uploadedAt?: string;
};

export type SiteLogoAsset = SiteMediaAsset & {
  label: string;
  helper: string;
};

export type SiteMediaFieldDefinition = {
  id: string;
  label: string;
  section: string;
  type: SiteMediaType;
  defaultUrl: string;
  defaultAlt: string;
};

export type SitePageMediaSettings = Record<string, SiteMediaAsset>;

export type SiteMediaSettings = {
  logos: Record<SiteLogoKey, SiteLogoAsset>;
  pages: Record<SiteContentPageKey, SitePageMediaSettings>;
};

export const SITE_CONTENT_PAGES: Array<{
  key: SiteContentPageKey;
  label: string;
  description: string;
}> = [
  {
    key: "home",
    label: "Home",
    description: "Hero, features, service previews, backgrounds, testimonials, and footer media.",
  },
  {
    key: "about",
    label: "About Us",
    description: "Story, leadership, values, parallax, testimonial, and footer media.",
  },
  {
    key: "services",
    label: "Services",
    description: "Hero, service-grid icons, section illustrations, banners, testimonials, and footer media.",
  },
  {
    key: "projects",
    label: "Projects",
    description: "Portfolio hero, project cards, filters, banners, testimonials, and footer media.",
  },
];

export const SITE_MEDIA_FIELD_DEFINITIONS: Record<
  SiteContentPageKey,
  SiteMediaFieldDefinition[]
> = {
  home: [
    mediaField("homeHeroImage", "Hero image", "Hero Section", "image", "/HOOM-HERO.png", "Home page hero image"),
    mediaField("homeHeroVideo", "Hero video", "Hero Section", "video", "/about-hero.mp4", "Home page hero video"),
    mediaField("homeHeroMobileImage", "Mobile hero image", "Hero Section", "image", "/HOOM-HERO.png", "Mobile home hero image"),
    mediaField("homeFeatureIconPrimary", "Primary feature icon", "Features & Services Grid", "image", "/logo.png", "Primary feature icon"),
    mediaField("homeFeatureIconSecondary", "Secondary feature icon", "Features & Services Grid", "image", "/logo.png", "Secondary feature icon"),
    mediaField("homeServicesIllustration", "Services grid illustration", "Features & Services Grid", "image", "/about-poto1.jpg", "Home services grid illustration"),
    mediaField("homeParallaxBackground", "Parallax background", "Backgrounds & Banners", "image", "/HOOM-HERO.png", "Home parallax background"),
    mediaField("homeCtaBanner", "CTA banner", "Backgrounds & Banners", "image", "/og.png", "Home call to action banner"),
    mediaField("homeTestimonialPortrait", "Testimonial portrait", "Testimonials & Footer", "image", "/logo.png", "Home testimonial portrait"),
    mediaField("homeFooterBrandMark", "Footer brand mark", "Testimonials & Footer", "image", "/logo.png", "Home footer brand mark"),
  ],
  about: [
    mediaField("aboutHeroImage", "Hero image", "Hero Section", "image", "/about-poto1.jpg", "About page hero image"),
    mediaField("aboutHeroVideo", "Hero video", "Hero Section", "video", "/about-hero.mp4", "About page hero video"),
    mediaField("aboutHeroMobileImage", "Mobile hero image", "Hero Section", "image", "/HOOM-HERO.png", "Mobile about hero image"),
    mediaField("aboutValuesIcon", "Values icon", "Features & Services Grid", "image", "/logo.png", "About values icon"),
    mediaField("aboutTeamIllustration", "Team illustration", "Features & Services Grid", "image", "/og.png", "About team illustration"),
    mediaField("aboutCultureIllustration", "Culture illustration", "Features & Services Grid", "image", "/HOOM-HERO.png", "About culture illustration"),
    mediaField("aboutStoryParallax", "Story parallax background", "Backgrounds & Banners", "image", "/about-poto1.jpg", "About story parallax background"),
    mediaField("aboutMilestonesBanner", "Milestones banner", "Backgrounds & Banners", "image", "/og.png", "About milestones banner"),
    mediaField("aboutTestimonialLogo", "Testimonial logo", "Testimonials & Footer", "image", "/logo.png", "About testimonial logo"),
    mediaField("aboutFooterSecondaryMark", "Footer secondary mark", "Testimonials & Footer", "image", "/logo.png", "About footer secondary mark"),
  ],
  services: [
    mediaField("servicesHeroImage", "Hero image", "Hero Section", "image", "/og.png", "Services page hero image"),
    mediaField("servicesHeroVideo", "Hero video", "Hero Section", "video", "/about-hero1.mp4", "Services page hero video"),
    mediaField("servicesHeroMobileImage", "Mobile hero image", "Hero Section", "image", "/HOOM-HERO.png", "Mobile services hero image"),
    mediaField("servicesGridIconPlanning", "Planning service icon", "Features & Services Grid", "image", "/logo.png", "Planning service icon"),
    mediaField("servicesGridIconExecution", "Execution service icon", "Features & Services Grid", "image", "/logo.png", "Execution service icon"),
    mediaField("servicesGridIllustration", "Services section illustration", "Features & Services Grid", "image", "/og.png", "Services grid illustration"),
    mediaField("servicesProcessBackground", "Process background", "Backgrounds & Banners", "image", "/HOOM-HERO.png", "Services process background"),
    mediaField("servicesBanner", "Services banner", "Backgrounds & Banners", "image", "/og.png", "Services page banner"),
    mediaField("servicesTestimonialPortrait", "Testimonial portrait", "Testimonials & Footer", "image", "/logo.png", "Services testimonial portrait"),
    mediaField("servicesFooterBrandMark", "Footer brand mark", "Testimonials & Footer", "image", "/logo.png", "Services footer brand mark"),
  ],
  projects: [
    mediaField("projectsHeroImage", "Hero image", "Hero Section", "image", "/HOOM-HERO7.jpg", "Projects page hero image"),
    mediaField("projectsHeroVideo", "Hero video", "Hero Section", "video", "/about-hero1.mp4", "Projects page hero video"),
    mediaField("projectsHeroMobileImage", "Mobile hero image", "Hero Section", "image", "/og.png", "Mobile projects hero image"),
    mediaField("projectsGridIconResidential", "Residential projects icon", "Features & Services Grid", "image", "/logo.png", "Residential projects icon"),
    mediaField("projectsGridIconCommercial", "Commercial projects icon", "Features & Services Grid", "image", "/logo.png", "Commercial projects icon"),
    mediaField("projectsDefaultCardCover", "Default project card cover", "Features & Services Grid", "image", "/og.png", "Default project card cover"),
    mediaField("projectsListingBackground", "Listing background", "Backgrounds & Banners", "image", "/HOOM-HERO.png", "Projects listing background"),
    mediaField("projectsFilterBanner", "Filter banner", "Backgrounds & Banners", "image", "/og.png", "Projects filter banner"),
    mediaField("projectsTestimonialLogo", "Testimonial logo", "Testimonials & Footer", "image", "/logo.png", "Projects testimonial logo"),
    mediaField("projectsFooterSecondaryMark", "Footer secondary mark", "Testimonials & Footer", "image", "/logo.png", "Projects footer secondary mark"),
  ],
};

export function createDefaultSiteMediaSettings(): SiteMediaSettings {
  return {
    logos: {
      light: logo("Light logo", "Used on white and light backgrounds.", "/logo.png", "Light Maedin logo"),
      dark: logo("Dark logo", "Used on dark overlays and footer surfaces.", "/logo.png", "Dark Maedin logo"),
      footer: logo("Footer logo", "Used in footer and secondary navigation.", "/logo.png", "Footer Maedin logo"),
      mark: logo("Secondary mark", "Used for compact marks, testimonials, and badges.", "/logo.png", "Maedin secondary mark"),
    },
    pages: Object.fromEntries(
      SITE_CONTENT_PAGES.map(page => [
        page.key,
        Object.fromEntries(
          SITE_MEDIA_FIELD_DEFINITIONS[page.key].map(field => [
            field.id,
            {
              url: field.defaultUrl,
              alt: field.defaultAlt,
            },
          ])
        ),
      ])
    ) as Record<SiteContentPageKey, SitePageMediaSettings>,
  };
}

export function normalizeSiteMediaSettings(value: unknown): SiteMediaSettings {
  const defaults = createDefaultSiteMediaSettings();
  const source = value && typeof value === "object" ? (value as Partial<SiteMediaSettings>) : {};

  const logos = { ...defaults.logos };
  (Object.keys(logos) as SiteLogoKey[]).forEach(key => {
    logos[key] = {
      ...logos[key],
      ...(source.logos?.[key] || {}),
      label: logos[key].label,
      helper: logos[key].helper,
    };
  });

  const pages = { ...defaults.pages };
  SITE_CONTENT_PAGES.forEach(page => {
    pages[page.key] = { ...defaults.pages[page.key] };
    SITE_MEDIA_FIELD_DEFINITIONS[page.key].forEach(field => {
      pages[page.key][field.id] = {
        ...pages[page.key][field.id],
        ...(source.pages?.[page.key]?.[field.id] || {}),
      };
    });
  });

  return { logos, pages };
}

function mediaField(
  id: string,
  label: string,
  section: string,
  type: SiteMediaType,
  defaultUrl: string,
  defaultAlt: string
): SiteMediaFieldDefinition {
  return { id, label, section, type, defaultUrl, defaultAlt };
}

function logo(
  label: string,
  helper: string,
  url: string,
  alt: string
): SiteLogoAsset {
  return { label, helper, url, alt };
}
