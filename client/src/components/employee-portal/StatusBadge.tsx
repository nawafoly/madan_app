import { cn } from "@/lib/utils";
import type { Language } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";

export type EmployeePortalStatusTone =
  | "pending"
  | "approved"
  | "rejected"
  | "active"
  | "inactive"
  | "neutral";

type StatusBadgeProps = {
  status?: unknown;
  label?: string;
  className?: string;
  language?: Language;
};

function normalizeStatus(value: unknown): EmployeePortalStatusTone {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["pending", "review", "under_review", "waiting", "قيد المراجعة", "في الانتظار"].includes(normalized)) {
    return "pending";
  }

  if (["approved", "accepted", "active", "فعال", "مقبول", "معتمد"].includes(normalized)) {
    return normalized === "active" || normalized === "فعال" ? "active" : "approved";
  }

  if (["rejected", "declined", "refused", "مرفوض"].includes(normalized)) {
    return "rejected";
  }

  if (["inactive", "expired", "disabled", "غير فعال"].includes(normalized)) {
    return "inactive";
  }

  return "neutral";
}

function getDefaultStatusLabel(tone: EmployeePortalStatusTone, language: Language) {
  switch (tone) {
    case "pending":
      return tr(language, "قيد المراجعة", "Under Review");
    case "approved":
      return tr(language, "مقبول", "Approved");
    case "rejected":
      return tr(language, "مرفوض", "Rejected");
    case "active":
      return tr(language, "فعال", "Active");
    case "inactive":
      return tr(language, "غير فعال", "Inactive");
    default:
      return tr(language, "غير محدد", "Not Set");
  }
}

export default function StatusBadge({
  status,
  label,
  className,
  language = "ar",
}: StatusBadgeProps) {
  const tone = normalizeStatus(status);

  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-full px-3 py-1 text-xs font-semibold leading-5",
        tone === "pending" && "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
        (tone === "approved" || tone === "active") &&
          "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        tone === "rejected" && "bg-rose-50 text-rose-700 ring-1 ring-rose-100",
        tone === "inactive" && "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
        tone === "neutral" && "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
        className
      )}
    >
      {label || getDefaultStatusLabel(tone, language)}
    </span>
  );
}

