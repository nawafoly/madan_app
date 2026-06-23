import { cn } from "@/lib/utils";

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

function getDefaultStatusLabel(tone: EmployeePortalStatusTone) {
  switch (tone) {
    case "pending":
      return "قيد المراجعة";
    case "approved":
      return "مقبول";
    case "rejected":
      return "مرفوض";
    case "active":
      return "فعال";
    case "inactive":
      return "غير فعال";
    default:
      return "غير محدد";
  }
}

export default function StatusBadge({
  status,
  label,
  className,
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
      {label || getDefaultStatusLabel(tone)}
    </span>
  );
}

