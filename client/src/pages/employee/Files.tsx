import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";

import EmployeeLayout from "@/components/EmployeeLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { db } from "@/_core/firebase";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  EMPLOYEE_FILES_COLLECTION,
  filterActiveEmployeeFiles,
  normalizeEmployeeFileRecord,
  sortEmployeeFiles,
  type EmployeeFileRecord,
} from "@/lib/employeeFiles";
import { formatDateTimeEN, formatFileSizeEN } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function FilesStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-5 py-4 shadow-sm",
        tone === "warning"
          ? "border-amber-200 bg-amber-50/80"
          : tone === "success"
            ? "border-emerald-200 bg-emerald-50/80"
            : "border-slate-200/80 bg-white/90"
      )}
    >
      <div className="text-xs font-semibold tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function EmployeeFileCard({
  file,
  onOpen,
}: {
  file: EmployeeFileRecord;
  onOpen: (file: EmployeeFileRecord) => Promise<void>;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_22px_60px_-44px_rgba(15,23,42,0.22)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-full shadow-none",
                file.statusTone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              )}
            >
              {file.statusLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "rounded-full shadow-none",
                file.readStatusTone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              {file.readStatusLabel}
            </Badge>
            <Badge variant="outline" className="rounded-full bg-slate-50 shadow-none">
              {file.fileTypeLabel}
            </Badge>
          </div>

          <div>
            <div className="text-lg font-semibold text-slate-950">{file.title}</div>
            <div className="mt-1 text-sm text-slate-500">
              {file.uploadedAtDate
                ? `تاريخ الرفع: ${formatDateTimeEN(file.uploadedAtDate)}`
                : "تاريخ الرفع غير متوفر"}
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
            {file.description || "لا يوجد وصف لهذا الملف."}
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
              {file.fileName}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
              {formatFileSizeEN(file.fileSize)}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5">
              {file.contentType || "بدون نوع"}
            </span>
          </div>

          {file.isRead && file.readAtDate ? (
            <div className="text-xs text-emerald-700">
              تمت القراءة في {formatDateTimeEN(file.readAtDate)}
            </div>
          ) : (
            <div className="text-xs text-amber-700">لم يتم فتح الملف بعد.</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => void onOpen(file)}
          >
            <Eye className="ml-2 h-4 w-4" />
            فتح الملف
          </Button>

          {file.downloadUrl ? (
            <Button asChild className="rounded-full">
              <a href={file.downloadUrl} rel="noreferrer" download={file.fileName || true}>
                <Download className="ml-2 h-4 w-4" />
                تحميل
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeFilesPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<EmployeeFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(
        collection(db, EMPLOYEE_FILES_COLLECTION),
        where("employeeUid", "==", user.uid)
      ),
      snapshot => {
        const rows = sortEmployeeFiles(
          snapshot.docs.map(docSnapshot =>
            normalizeEmployeeFileRecord(
              docSnapshot.id,
              (docSnapshot.data() as Record<string, any>) || {}
            )
          )
        );
        setFiles(rows);
        setLoading(false);
      },
      error => {
        console.error("employee_files_snapshot_error", error);
        setFiles([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const visibleFiles = useMemo(() => filterActiveEmployeeFiles(files), [files]);
  const unreadFilesCount = useMemo(
    () => visibleFiles.filter(file => !file.isRead).length,
    [visibleFiles]
  );
  const readFilesCount = visibleFiles.length - unreadFilesCount;
  const archivedFilesCount = files.length - visibleFiles.length;

  const handleOpenFile = async (file: EmployeeFileRecord) => {
    const targetUrl = file.viewUrl || file.downloadUrl;
    if (!targetUrl) {
      toast.error("تعذر العثور على رابط الملف.");
      return;
    }

    const previewWindow =
      typeof window !== "undefined" ? window.open("", "_blank") : null;

    setOpeningFileId(file.id);
    try {
      if (!file.isRead) {
        await updateDoc(doc(db, EMPLOYEE_FILES_COLLECTION, file.id), {
          isRead: true,
          readAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("employee_file_mark_read_failed", error);
      toast.error("تعذر تحديث حالة القراءة، وسيتم فتح الملف مباشرة.");
    } finally {
      setOpeningFileId(current => (current === file.id ? null : current));
    }

    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.location.href = targetUrl;
      return;
    }

    const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = targetUrl;
    }
  };

  if (!user) return null;

  return (
    <EmployeeLayout
      title="ملفاتي"
      description="هنا تظهر الملفات والخطابات الداخلية المرفوعة لك من الموارد البشرية. يمكنك فتح الملف أو تحميله، وعند الفتح يتم تسجيل أنه تمت قراءته."
    >
      <section className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <FilesStat label="النسخ الحالية" value={String(visibleFiles.length)} />
          <FilesStat
            label="ملفات جديدة"
            value={String(unreadFilesCount)}
            tone="warning"
          />
          <FilesStat
            label="ملفات مقروءة"
            value={String(readFilesCount)}
            tone="success"
          />
        </div>

        {archivedFilesCount > 0 ? (
          <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
            يتم عرض النسخة الحالية فقط لكل ملف. تم إخفاء {archivedFilesCount} من
            النسخ المستبدلة من القائمة الأساسية.
          </div>
        ) : null}

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_28px_80px_-52px_rgba(15,23,42,0.28)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              <FileText className="h-4 w-4" />
              الملفات الداخلية
            </div>
            <CardTitle className="text-xl font-semibold text-slate-950">
              الملفات المرسلة إليك
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-slate-600">
              افتح أي ملف من القائمة لعرضه مباشرة وتسجيل حالة القراءة.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {loading ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center text-sm text-slate-500">
                جاري تحميل الملفات...
              </div>
            ) : visibleFiles.length ? (
              <div className="space-y-4">
                {visibleFiles.map(file => (
                  <div key={file.id} className="space-y-2">
                    <EmployeeFileCard file={file} onOpen={handleOpenFile} />
                    {openingFileId === file.id ? (
                      <div className="px-2 text-xs text-slate-500">
                        جاري فتح الملف...
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty className="min-h-[320px] rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70">
                <EmptyHeader>
                  <EmptyMedia
                    variant="icon"
                    className="bg-[#F2B705]/12 text-[#030640]"
                  >
                    <Inbox className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>لا توجد ملفات حالياً</EmptyTitle>
                  <EmptyDescription>
                    عندما ترفع الموارد البشرية ملفًا لك سيظهر هنا مع حالته وتاريخ رفعه.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5 text-sm leading-7 text-slate-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            {unreadFilesCount > 0 ? (
              <Clock3 className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            حالة القراءة
          </div>
          <p className="mt-3">
            الملفات التي لم تفتحها بعد تظهر بحالة "جديد"، وعند فتح الملف يتم
            تحديث حالته إلى "مقروء" مع تسجيل وقت القراءة.
          </p>
        </div>
      </section>
    </EmployeeLayout>
  );
}
