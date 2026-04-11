import type { ComponentType } from "react";
import { BriefcaseBusiness, ChevronDown, ChevronUp } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmployeeWorkspaceNavSection<SectionKey extends string = string> = {
  key: SectionKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type EmployeeWorkspaceNavProps<SectionKey extends string> = {
  activeSectionKey: SectionKey;
  activeSectionLabel: string;
  employeeAvatarUrl?: string | null;
  employeeEmail?: string | null;
  employeeName: string;
  isOpen: boolean;
  onSelectSection: (sectionKey: SectionKey) => void;
  onToggleOpen: () => void;
  sections: EmployeeWorkspaceNavSection<SectionKey>[];
};

function initialsFromName(name: string, email?: string) {
  const source = String(name || email || "").trim();
  if (!source) return "م";
  const parts = source
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return source.slice(0, 2).toUpperCase();
  }

  return parts
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();
}

function EmployeeWorkspaceAvatar({
  avatarUrl,
  email,
  name,
}: {
  avatarUrl?: string | null;
  email?: string | null;
  name: string;
}) {
  return (
    <Avatar className="h-12 w-12 shrink-0 rounded-full border border-slate-200 bg-slate-100 shadow-sm">
      <AvatarImage
        src={avatarUrl || undefined}
        alt={name}
        className="object-cover"
      />
      <AvatarFallback className="bg-slate-900 text-sm font-semibold text-white">
        {initialsFromName(name, email || undefined)}
      </AvatarFallback>
    </Avatar>
  );
}

function EmployeeWorkspaceNavTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[140px] items-center justify-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-semibold transition-all",
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.62)]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <Icon
        className={cn("h-4 w-4", active ? "text-white" : "text-slate-500")}
      />
      <span>{label}</span>
    </button>
  );
}

export default function EmployeeWorkspaceNav<SectionKey extends string>({
  activeSectionKey,
  activeSectionLabel,
  employeeAvatarUrl,
  employeeEmail,
  employeeName,
  isOpen,
  onSelectSection,
  onToggleOpen,
  sections,
}: EmployeeWorkspaceNavProps<SectionKey>) {
  return (
    <Card className="gap-0 overflow-hidden border-slate-200/80 bg-white/95 py-0 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.18)]">
      <CardHeader className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(244,247,255,0.95)_100%)] px-6 pt-6 pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <EmployeeWorkspaceAvatar
              avatarUrl={employeeAvatarUrl}
              email={employeeEmail}
              name={employeeName}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
                <BriefcaseBusiness className="h-4 w-4 text-[#030640]" />
                تنقل داخلي مستقل
              </div>
              <CardTitle className="text-xl tracking-tight text-slate-950">
                أقسام ملف الموظف
              </CardTitle>
              <div className="text-sm font-medium text-slate-600">
                {employeeName}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full border-slate-200 bg-white/90 text-slate-700 shadow-none hover:bg-slate-50 xl:w-auto"
            onClick={onToggleOpen}
          >
            {isOpen ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4" />
            )}
            {isOpen ? "إخفاء التنقل الداخلي" : "إظهار التنقل الداخلي"}
          </Button>
        </div>
      </CardHeader>

      {isOpen ? (
        <CardContent className="border-t border-slate-100 px-6 pb-6 pt-5">
          <div className="space-y-4">
            <div className="flex flex-col gap-1 text-right">
              <div className="text-sm font-semibold text-slate-900">
                اختر القسم المطلوب
              </div>
              <div className="text-sm text-slate-500">
                يتم عرض قسم واحد فقط أسفل هذا التنقل حسب التبويب المحدد. القسم
                النشط الآن: {activeSectionLabel}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {sections.map(section => (
                <EmployeeWorkspaceNavTabButton
                  key={section.key}
                  active={activeSectionKey === section.key}
                  icon={section.icon}
                  label={section.label}
                  onClick={() => onSelectSection(section.key)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
