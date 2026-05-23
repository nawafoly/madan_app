import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Moon,
  Save,
  Sun,
  UploadCloud,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video";
type PageKey = "home" | "about" | "services" | "projects";
type UploadState = "idle" | "uploading" | "success" | "error";

type LogoVariant = {
  key: "light" | "dark";
  label: string;
  helper: string;
  icon: typeof Sun;
  currentUrl: string;
  draftUrl: string;
  fileName: string;
  uploadState: UploadState;
  progress: number;
};

type MediaField = {
  id: string;
  label: string;
  section: string;
  type: MediaType;
  url: string;
  draftUrl: string;
  alt: string;
  fileName: string;
  uploadState: UploadState;
  progress: number;
};

type PageMediaConfig = {
  key: PageKey;
  label: string;
  description: string;
  fields: MediaField[];
};

const PAGE_OPTIONS: Array<Pick<PageMediaConfig, "key" | "label" | "description">> = [
  {
    key: "home",
    label: "Home",
    description: "Hero, featured blocks, and landing page visuals.",
  },
  {
    key: "about",
    label: "About Us",
    description: "Company story visuals, culture media, and backgrounds.",
  },
  {
    key: "services",
    label: "Services",
    description: "Service cards, process imagery, and section backgrounds.",
  },
  {
    key: "projects",
    label: "Projects",
    description: "Portfolio hero, listing covers, and project media.",
  },
];

const DEFAULT_LOGOS: LogoVariant[] = [
  {
    key: "light",
    label: "Light logo",
    helper: "Used on white and light backgrounds.",
    icon: Sun,
    currentUrl: "/logo.png",
    draftUrl: "",
    fileName: "",
    uploadState: "idle",
    progress: 0,
  },
  {
    key: "dark",
    label: "Dark logo",
    helper: "Used on dark overlays and footer surfaces.",
    icon: Moon,
    currentUrl: "/logo.png",
    draftUrl: "",
    fileName: "",
    uploadState: "idle",
    progress: 0,
  },
];

const DEFAULT_PAGE_MEDIA: PageMediaConfig[] = [
  {
    key: "home",
    label: "Home",
    description: "Hero, featured blocks, and landing page visuals.",
    fields: [
      createMediaField("home-hero", "Hero background", "Hero Section", "image", "/HOOM-HERO.png", "Main home hero image"),
      createMediaField("home-intro-video", "Intro video", "Hero Section", "video", "/about-hero.mp4", "Introductory brand video"),
      createMediaField("home-feature", "Featured project image", "Features", "image", "/og.png", "Featured project preview"),
      createMediaField("home-pattern", "Section background", "Backgrounds", "image", "/HOOM-HERO.png", "Subtle section background"),
    ],
  },
  {
    key: "about",
    label: "About Us",
    description: "Company story visuals, culture media, and backgrounds.",
    fields: [
      createMediaField("about-hero", "About hero video", "Hero Section", "video", "/about-hero.mp4", "About page hero video"),
      createMediaField("about-story", "Story image", "Content Sections", "image", "/og.png", "Company story image"),
      createMediaField("about-team", "Team image", "Content Sections", "image", "/HOOM-HERO.png", "Team and culture image"),
    ],
  },
  {
    key: "services",
    label: "Services",
    description: "Service cards, process imagery, and section backgrounds.",
    fields: [
      createMediaField("services-hero", "Services hero image", "Hero Section", "image", "/og.png", "Services overview hero"),
      createMediaField("services-process", "Process visual", "Features", "image", "/HOOM-HERO.png", "Service process visual"),
      createMediaField("services-background", "Services background", "Backgrounds", "image", "/og.png", "Services background texture"),
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "Portfolio hero, listing covers, and project media.",
    fields: [
      createMediaField("projects-hero", "Projects hero image", "Hero Section", "image", "/HOOM-HERO.png", "Projects listing hero"),
      createMediaField("projects-cover", "Default project cover", "Project Cards", "image", "/og.png", "Default project card cover"),
      createMediaField("projects-video", "Portfolio video", "Backgrounds", "video", "/about-hero1.mp4", "Project showcase video"),
    ],
  },
];

function createMediaField(
  id: string,
  label: string,
  section: string,
  type: MediaType,
  url: string,
  alt: string
): MediaField {
  return {
    id,
    label,
    section,
    type,
    url,
    draftUrl: "",
    alt,
    fileName: "",
    uploadState: "idle",
    progress: 0,
  };
}

function getPreviewUrl(currentUrl: string, draftUrl: string) {
  return draftUrl || currentUrl;
}

function groupFieldsBySection(fields: MediaField[]) {
  return fields.reduce<Record<string, MediaField[]>>((groups, field) => {
    groups[field.section] ||= [];
    groups[field.section].push(field);
    return groups;
  }, {});
}

export default function MediaBrandingSettings() {
  const [logos, setLogos] = useState<LogoVariant[]>(DEFAULT_LOGOS);
  const [pages, setPages] = useState<PageMediaConfig[]>(DEFAULT_PAGE_MEDIA);
  const [selectedPageKey, setSelectedPageKey] = useState<PageKey>("home");
  const [saveState, setSaveState] = useState<UploadState>("idle");

  const selectedPage = useMemo(
    () => pages.find(page => page.key === selectedPageKey) || pages[0],
    [pages, selectedPageKey]
  );

  const fieldsBySection = useMemo(
    () => groupFieldsBySection(selectedPage.fields),
    [selectedPage.fields]
  );

  const dirtyCount = useMemo(() => {
    const logoChanges = logos.filter(logo => logo.draftUrl || logo.fileName).length;
    const mediaChanges = pages.flatMap(page => page.fields).filter(field => field.draftUrl || field.fileName).length;
    return logoChanges + mediaChanges;
  }, [logos, pages]);

  const handleLogoFile = (key: LogoVariant["key"], event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setLogos(current =>
      current.map(logo =>
        logo.key === key
          ? {
            ...logo,
            draftUrl: objectUrl,
            fileName: file.name,
            uploadState: "uploading",
            progress: 68,
          }
          : logo
      )
    );
    window.setTimeout(() => {
      setLogos(current =>
        current.map(logo =>
          logo.key === key ? { ...logo, uploadState: "success", progress: 100 } : logo
        )
      );
    }, 700);
  };

  const updateMediaField = (
    fieldId: string,
    patch: Partial<Pick<MediaField, "draftUrl" | "alt" | "fileName" | "uploadState" | "progress">>
  ) => {
    setPages(current =>
      current.map(page =>
        page.key === selectedPageKey
          ? {
            ...page,
            fields: page.fields.map(field =>
              field.id === fieldId ? { ...field, ...patch } : field
            ),
          }
          : page
      )
    );
  };

  const handleMediaFile = (fieldId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    updateMediaField(fieldId, {
      draftUrl: URL.createObjectURL(file),
      fileName: file.name,
      uploadState: "uploading",
      progress: 52,
    });
    window.setTimeout(() => {
      updateMediaField(fieldId, { uploadState: "success", progress: 100 });
    }, 800);
  };

  const handleSave = async () => {
    setSaveState("uploading");
    try {
      await new Promise(resolve => window.setTimeout(resolve, 900));
      setLogos(current =>
        current.map(logo => ({
          ...logo,
          currentUrl: logo.draftUrl || logo.currentUrl,
          draftUrl: "",
          fileName: "",
          uploadState: "idle",
          progress: 0,
        }))
      );
      setPages(current =>
        current.map(page => ({
          ...page,
          fields: page.fields.map(field => ({
            ...field,
            url: field.draftUrl || field.url,
            draftUrl: "",
            fileName: "",
            uploadState: "idle",
            progress: 0,
          })),
        }))
      );
      setSaveState("success");
      toast.success("Media settings saved.");
      window.setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("error");
      toast.error("Unable to save media settings.");
    }
  };

  return (
    <div className="space-y-8 text-slate-950" dir="ltr">
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <Badge className="w-fit rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                  Admin settings
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    Media & Branding Settings
                  </h1>
                  <p className="text-sm leading-7 text-slate-600">
                    Manage website logos, page images, and videos from one structured control surface.
                    The state shape is ready to connect to an upload API and persistence endpoint.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-[#F8F9FA] p-4 shadow-sm sm:min-w-72">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-slate-600">Pending changes</span>
                  <span className="text-2xl font-semibold text-slate-950">{dirtyCount}</span>
                </div>
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
                  onClick={handleSave}
                  disabled={saveState === "uploading"}
                >
                  {saveState === "uploading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saveState === "success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-6">
              <SettingsCard
                title="Logo Management"
                description="Upload dedicated logo variants for light and dark UI contexts."
                icon={Monitor}
              >
                <div className="space-y-4">
                  {logos.map(logo => (
                    <LogoUploadCard
                      key={logo.key}
                      logo={logo}
                      onFileChange={event => handleLogoFile(logo.key, event)}
                    />
                  ))}
                </div>
              </SettingsCard>
            </div>

            <div className="space-y-6">
              <SettingsCard
                title="Page-by-Page Media Controller"
                description="Select a public page, then update each media slot by section."
                icon={ImageIcon}
                action={
                  <Select
                    value={selectedPageKey}
                    onValueChange={value => setSelectedPageKey(value as PageKey)}
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm sm:w-64">
                      <SelectValue placeholder="Select page" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_OPTIONS.map(page => (
                        <SelectItem key={page.key} value={page.key}>
                          {page.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              >
                <div className="rounded-2xl border border-slate-100 bg-[#F8F9FA] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        {selectedPage.label}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedPage.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit rounded-full bg-white">
                      {selectedPage.fields.length} media slots
                    </Badge>
                  </div>
                </div>

                <div className="mt-6 space-y-8">
                  {Object.entries(fieldsBySection).map(([section, fields]) => (
                    <div key={section} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {section}
                        </h3>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {fields.map(field => (
                          <MediaFieldCard
                            key={field.id}
                            field={field}
                            onUrlChange={value =>
                              updateMediaField(field.id, { draftUrl: value, uploadState: "idle" })
                            }
                            onAltChange={value => updateMediaField(field.id, { alt: value })}
                            onFileChange={event => handleMediaFile(field.id, event)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsCard>
            </div>
          </section>

          {saveState === "error" ? (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              Save failed. Check the media API connection and try again.
            </div>
          ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function LogoUploadCard({
  logo,
  onFileChange,
}: {
  logo: LogoVariant;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const Icon = logo.icon;
  const previewUrl = getPreviewUrl(logo.currentUrl, logo.draftUrl);

  return (
    <div className="rounded-2xl border border-slate-100 bg-[#F8F9FA] p-4 shadow-sm transition hover:border-slate-200 hover:bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">{logo.label}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{logo.helper}</p>
          </div>
        </div>
        <StatusBadge state={logo.uploadState} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <LogoPreview title="Current" src={logo.currentUrl} />
        <LogoPreview title="New preview" src={previewUrl} highlighted={Boolean(logo.draftUrl)} />
      </div>

      <UploadProgress state={logo.uploadState} progress={logo.progress} fileName={logo.fileName} />

      <Label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#F2B705] hover:bg-[#F2B705]/10">
        <UploadCloud className="h-4 w-4" />
        Upload logo file
        <Input type="file" accept="image/*" className="sr-only" onChange={onFileChange} />
      </Label>
    </div>
  );
}

function LogoPreview({
  title,
  src,
  highlighted = false,
}: {
  title: string;
  src: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3",
        highlighted ? "border-emerald-200 ring-2 ring-emerald-100" : "border-slate-100"
      )}
    >
      <div className="text-xs font-medium text-slate-500">{title}</div>
      <div className="mt-3 flex h-24 items-center justify-center rounded-lg bg-slate-950/95 p-4">
        {src ? (
          <img src={src} alt={title} className="max-h-14 max-w-full object-contain" />
        ) : (
          <FileImage className="h-7 w-7 text-white/50" />
        )}
      </div>
    </div>
  );
}

function MediaFieldCard({
  field,
  onUrlChange,
  onAltChange,
  onFileChange,
}: {
  field: MediaField;
  onUrlChange: (value: string) => void;
  onAltChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const previewUrl = getPreviewUrl(field.url, field.draftUrl);
  const Icon = field.type === "video" ? Video : ImageIcon;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-slate-950">{field.label}</h4>
            <p className="mt-1 text-xs capitalize text-slate-500">{field.type} media</p>
          </div>
        </div>
        <StatusBadge state={field.uploadState} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
        {field.type === "video" ? (
          <video src={previewUrl} className="h-44 w-full object-cover" muted playsInline controls />
        ) : (
          <img src={previewUrl} alt={field.alt || field.label} className="h-44 w-full object-cover" />
        )}
      </div>

      <UploadProgress state={field.uploadState} progress={field.progress} fileName={field.fileName} />

      <div className="mt-4 grid gap-3">
        <FieldControl label="Media URL">
          <Input
            value={field.draftUrl || field.url}
            onChange={event => onUrlChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
            dir="ltr"
          />
        </FieldControl>

        <FieldControl label="Alt text">
          <Input
            value={field.alt}
            onChange={event => onAltChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
          />
        </FieldControl>

        <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-[#F8F9FA] px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#F2B705] hover:bg-[#F2B705]/10">
          <UploadCloud className="h-4 w-4" />
          Upload {field.type === "video" ? "video" : "image"}
          <Input
            type="file"
            accept={field.type === "video" ? "video/*" : "image/*"}
            className="sr-only"
            onChange={onFileChange}
          />
        </Label>
      </div>
    </div>
  );
}

function FieldControl({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

function UploadProgress({
  state,
  progress,
  fileName,
}: {
  state: UploadState;
  progress: number;
  fileName: string;
}) {
  if (state === "idle" && !fileName) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-slate-600">
          {fileName || "Upload ready"}
        </span>
        <span className="font-semibold text-slate-900">{progress}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            state === "error" ? "bg-rose-500" : "bg-emerald-500"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: UploadState }) {
  if (state === "success") {
    return (
      <Badge className="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Ready
      </Badge>
    );
  }

  if (state === "uploading") {
    return (
      <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Uploading
      </Badge>
    );
  }

  if (state === "error") {
    return (
      <Badge className="rounded-full bg-rose-50 text-rose-700 hover:bg-rose-50">
        Error
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500">
      Idle
    </Badge>
  );
}
