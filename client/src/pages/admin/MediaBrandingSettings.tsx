import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
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
import { uploadDocumentToCloudflare } from "@/lib/documentUploadService";
import {
  SITE_CONTENT_PAGES,
  SITE_MEDIA_FIELD_DEFINITIONS,
  type SiteContentPageKey,
  type SiteLogoKey,
  type SiteMediaAsset,
  type SiteMediaFieldDefinition,
  type SiteMediaSettings,
} from "@/lib/siteContentMedia";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "uploading" | "success" | "error";

type UploadStatus = {
  state: UploadState;
  progress: number;
  fileName: string;
  message?: string;
};

type MediaBrandingSettingsProps = {
  media: SiteMediaSettings;
  onMediaChange: Dispatch<SetStateAction<SiteMediaSettings>>;
  onSave: () => Promise<void>;
  saving: boolean;
};

const LOGO_ORDER: Array<{
  key: SiteLogoKey;
  icon: LucideIcon;
}> = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "footer", icon: Monitor },
  { key: "mark", icon: ShieldCheck },
];

export default function MediaBrandingSettings({
  media,
  onMediaChange,
  onSave,
  saving,
}: MediaBrandingSettingsProps) {
  const [selectedPageKey, setSelectedPageKey] =
    useState<SiteContentPageKey>("home");
  const [uploadStatusById, setUploadStatusById] = useState<
    Record<string, UploadStatus>
  >({});
  const [localPreviewById, setLocalPreviewById] = useState<Record<string, string>>(
    {}
  );
  const [saveState, setSaveState] = useState<UploadState>("idle");
  const previewUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach(objectUrl => {
        URL.revokeObjectURL(objectUrl);
      });
      previewUrlsRef.current = {};
    };
  }, []);

  const selectedPage = useMemo(
    () => SITE_CONTENT_PAGES.find(page => page.key === selectedPageKey) || SITE_CONTENT_PAGES[0],
    [selectedPageKey]
  );

  const selectedDefinitions = SITE_MEDIA_FIELD_DEFINITIONS[selectedPageKey];
  const fieldsBySection = useMemo(
    () => groupFieldsBySection(selectedDefinitions),
    [selectedDefinitions]
  );

  const uploadInProgress = Object.values(uploadStatusById).some(
    status => status.state === "uploading"
  );

  const totalSlots =
    LOGO_ORDER.length +
    Object.values(SITE_MEDIA_FIELD_DEFINITIONS).reduce(
      (sum, fields) => sum + fields.length,
      0
    );
  const completedSlots =
    LOGO_ORDER.filter(({ key }) => hasCompleteAsset(media.logos[key])).length +
    Object.entries(SITE_MEDIA_FIELD_DEFINITIONS).reduce(
      (sum, [pageKey, fields]) =>
        sum +
        fields.filter(field =>
          hasCompleteAsset(media.pages[pageKey as SiteContentPageKey][field.id])
        ).length,
      0
    );

  const updateLogoAsset = (key: SiteLogoKey, patch: Partial<SiteMediaAsset>) => {
    onMediaChange(current => ({
      ...current,
      logos: {
        ...current.logos,
        [key]: {
          ...current.logos[key],
          ...patch,
        },
      },
    }));
  };

  const updatePageAsset = (
    pageKey: SiteContentPageKey,
    fieldId: string,
    patch: Partial<SiteMediaAsset>
  ) => {
    onMediaChange(current => ({
      ...current,
      pages: {
        ...current.pages,
        [pageKey]: {
          ...current.pages[pageKey],
          [fieldId]: {
            ...current.pages[pageKey][fieldId],
            ...patch,
          },
        },
      },
    }));
  };

  const setUploadStatus = (id: string, status: UploadStatus) => {
    setUploadStatusById(current => ({
      ...current,
      [id]: status,
    }));
  };

  const setLocalPreview = (id: string, file: File) => {
    const previous = previewUrlsRef.current[id];
    if (previous) URL.revokeObjectURL(previous);
    const objectUrl = URL.createObjectURL(file);
    previewUrlsRef.current[id] = objectUrl;
    setLocalPreviewById(current => ({ ...current, [id]: objectUrl }));
  };

  const clearLocalPreview = (id: string) => {
    const objectUrl = previewUrlsRef.current[id];
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    delete previewUrlsRef.current[id];
    setLocalPreviewById(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const uploadSiteMedia = async ({
    id,
    file,
    storageFolder,
  }: {
    id: string;
    file: File;
    storageFolder: string;
  }) => {
    setLocalPreview(id, file);
    setUploadStatus(id, {
      state: "uploading",
      progress: 30,
      fileName: file.name,
    });

    try {
      const uploaded = await uploadDocumentToCloudflare({
        entityType: "site_content",
        entityId: id,
        category: "site_media",
        kind: "attachment",
        file,
        storageFolder,
      });

      setUploadStatus(id, {
        state: "success",
        progress: 100,
        fileName: uploaded.fileName,
      });
      clearLocalPreview(id);
      return uploaded;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Media upload failed.";
      setUploadStatus(id, {
        state: "error",
        progress: 0,
        fileName: file.name,
        message,
      });
      toast.error(message);
      throw error;
    }
  };

  const handleLogoFile = async (
    key: SiteLogoKey,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    const uploadId = `logo-${key}`;
    try {
      const uploaded = await uploadSiteMedia({
        id: uploadId,
        file,
        storageFolder: "logos",
      });
      updateLogoAsset(key, {
        url: uploaded.fileUrl,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        contentType: uploaded.contentType,
        uploadedAt: uploaded.uploadedAt,
      });
      toast.success("Logo uploaded. Save content to publish the URL.");
    } catch {
      clearLocalPreview(uploadId);
    }
  };

  const handleMediaFile = async (
    pageKey: SiteContentPageKey,
    field: SiteMediaFieldDefinition,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    const uploadId = `${pageKey}-${field.id}`;
    try {
      const uploaded = await uploadSiteMedia({
        id: uploadId,
        file,
        storageFolder: `${pageKey}/${field.section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      });
      updatePageAsset(pageKey, field.id, {
        url: uploaded.fileUrl,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        contentType: uploaded.contentType,
        uploadedAt: uploaded.uploadedAt,
      });
      toast.success("Media uploaded. Save content to publish the URL.");
    } catch {
      clearLocalPreview(uploadId);
    }
  };

  const handleSave = async () => {
    if (uploadInProgress) {
      toast.error("Wait until the active upload finishes before saving.");
      return;
    }

    setSaveState("uploading");
    try {
      await onSave();
      setSaveState("success");
      window.setTimeout(() => setSaveState("idle"), 1200);
    } catch {
      setSaveState("error");
    }
  };

  return (
    <div className="space-y-8 text-slate-950" dir="ltr">
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="w-fit rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
              Site content media
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                Media & Branding Settings
              </h1>
              <p className="text-sm leading-7 text-slate-600">
                Uploads are sent to the permanent R2 worker first. The content payload stores only final URLs, alt text, file paths, and metadata.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-[#F8F9FA] p-4 shadow-sm sm:min-w-72">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-600">
                Completed media fields
              </span>
              <span className="text-2xl font-semibold text-slate-950">
                {completedSlots}/{totalSlots}
              </span>
            </div>
            <Button
              type="button"
              className="h-11 w-full rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              onClick={handleSave}
              disabled={saving || uploadInProgress || saveState === "uploading"}
            >
              {saving || saveState === "uploading" ? (
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
            description="Upload and describe every brand mark used by the public site."
            icon={Monitor}
          >
            <div className="space-y-4">
              {LOGO_ORDER.map(({ key, icon }) => (
                <LogoUploadCard
                  key={key}
                  asset={media.logos[key]}
                  icon={icon}
                  previewUrl={localPreviewById[`logo-${key}`]}
                  status={uploadStatusById[`logo-${key}`]}
                  onUrlChange={value => updateLogoAsset(key, { url: value })}
                  onAltChange={value => updateLogoAsset(key, { alt: value })}
                  onFileChange={event => handleLogoFile(key, event)}
                />
              ))}
            </div>
          </SettingsCard>
        </div>

        <div className="space-y-6">
          <SettingsCard
            title="Page-by-Page Media Controller"
            description="Every page has hero, grid, background, banner, testimonial, and footer media slots."
            icon={ImageIcon}
            action={
              <Select
                value={selectedPageKey}
                onValueChange={value => setSelectedPageKey(value as SiteContentPageKey)}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm sm:w-64">
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  {SITE_CONTENT_PAGES.map(page => (
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
                  {selectedDefinitions.length} media slots
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
                    {fields.map(field => {
                      const uploadId = `${selectedPageKey}-${field.id}`;
                      const asset = media.pages[selectedPageKey][field.id];
                      return (
                        <MediaFieldCard
                          key={field.id}
                          field={field}
                          asset={asset}
                          previewUrl={localPreviewById[uploadId]}
                          status={uploadStatusById[uploadId]}
                          onUrlChange={value =>
                            updatePageAsset(selectedPageKey, field.id, {
                              url: value,
                            })
                          }
                          onAltChange={value =>
                            updatePageAsset(selectedPageKey, field.id, {
                              alt: value,
                            })
                          }
                          onFileChange={event =>
                            handleMediaFile(selectedPageKey, field, event)
                          }
                        />
                      );
                    })}
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
          Save failed. Check the content settings document and try again.
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
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function LogoUploadCard({
  asset,
  icon: Icon,
  previewUrl,
  status,
  onUrlChange,
  onAltChange,
  onFileChange,
}: {
  asset: SiteMediaAsset & { label: string; helper: string };
  icon: LucideIcon;
  previewUrl?: string;
  status?: UploadStatus;
  onUrlChange: (value: string) => void;
  onAltChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-[#F8F9FA] p-4 shadow-sm transition hover:border-slate-200 hover:bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {asset.label}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {asset.helper}
            </p>
          </div>
        </div>
        <StatusBadge state={status?.state || "idle"} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <LogoPreview title="Saved" src={asset.url} />
        <LogoPreview
          title="Upload preview"
          src={previewUrl || asset.url}
          highlighted={Boolean(previewUrl)}
        />
      </div>

      <UploadProgress status={status} />

      <div className="mt-4 grid gap-3">
        <FieldControl label="Permanent URL">
          <Input
            value={asset.url}
            onChange={event => onUrlChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
            dir="ltr"
          />
        </FieldControl>
        <FieldControl label="Alt text">
          <Input
            value={asset.alt}
            onChange={event => onAltChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
          />
        </FieldControl>
        <UploadButton accept="image/*" label="Upload logo file" onFileChange={onFileChange} />
      </div>
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
  asset,
  previewUrl,
  status,
  onUrlChange,
  onAltChange,
  onFileChange,
}: {
  field: SiteMediaFieldDefinition;
  asset: SiteMediaAsset;
  previewUrl?: string;
  status?: UploadStatus;
  onUrlChange: (value: string) => void;
  onAltChange: (value: string) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const displayUrl = previewUrl || asset.url;
  const Icon = field.type === "video" ? Video : ImageIcon;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-slate-950">
              {field.label}
            </h4>
            <p className="mt-1 text-xs capitalize text-slate-500">
              {field.type} media
            </p>
          </div>
        </div>
        <StatusBadge state={status?.state || "idle"} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
        {field.type === "video" ? (
          <video src={displayUrl} className="h-44 w-full object-cover" muted playsInline controls />
        ) : (
          <img src={displayUrl} alt={asset.alt || field.label} className="h-44 w-full object-cover" />
        )}
      </div>

      <UploadProgress status={status} />

      <div className="mt-4 grid gap-3">
        <FieldControl label="Permanent URL">
          <Input
            value={asset.url}
            onChange={event => onUrlChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
            dir="ltr"
          />
        </FieldControl>

        <FieldControl label="Alt text">
          <Input
            value={asset.alt}
            onChange={event => onAltChange(event.target.value)}
            className="h-11 rounded-xl border-slate-200 bg-white"
          />
        </FieldControl>

        <UploadButton
          accept={field.type === "video" ? "video/*" : "image/*"}
          label={`Upload ${field.type === "video" ? "video" : "image"}`}
          onFileChange={onFileChange}
        />
      </div>
    </div>
  );
}

function UploadButton({
  accept,
  label,
  onFileChange,
}: {
  accept: string;
  label: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-[#F8F9FA] px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#F2B705] hover:bg-[#F2B705]/10">
      <UploadCloud className="h-4 w-4" />
      {label}
      <Input type="file" accept={accept} className="sr-only" onChange={onFileChange} />
    </Label>
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

function UploadProgress({ status }: { status?: UploadStatus }) {
  if (!status || (status.state === "idle" && !status.fileName)) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium text-slate-600">
          {status.message || status.fileName || "Upload ready"}
        </span>
        <span className="font-semibold text-slate-900">{status.progress}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            status.state === "error" ? "bg-rose-500" : "bg-emerald-500"
          )}
          style={{ width: `${status.progress}%` }}
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
        Uploaded
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

function groupFieldsBySection(fields: SiteMediaFieldDefinition[]) {
  return fields.reduce<Record<string, SiteMediaFieldDefinition[]>>(
    (groups, field) => {
      groups[field.section] ||= [];
      groups[field.section].push(field);
      return groups;
    },
    {}
  );
}

function hasCompleteAsset(asset: SiteMediaAsset) {
  return Boolean(asset.url.trim() && asset.alt.trim());
}
