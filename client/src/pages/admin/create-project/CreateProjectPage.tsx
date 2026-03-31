import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { collection, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import { AUDIT_ACTIONS, auditedSetDoc, buildAuditSource } from "@/lib/auditLog";
import { uploadInvestmentDocument } from "@/lib/documentUploadService";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { CreateProjectUi } from "./CreateProjectUi";
import {
  SECTION_DEFINITIONS,
  cleanStr,
  newAttachmentRow,
  newFaqRow,
  newMilestoneRow,
  parseAttachmentRows,
  parseFaqRows,
  parseMilestoneRows,
  progressModeLabels,
  projectTypeLabels,
  splitLines,
  statusLabels,
  toNumOrZero,
  vipTierLabels,
  type FormDataState,
  type ProgressMode,
} from "./shared";

export default function CreateProjectPage() {
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [draftProjectId] = useState(() => doc(collection(db, "projects")).id);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [activeSection, setActiveSection] = useState(SECTION_DEFINITIONS[0]?.id ?? "basic");

  const [formData, setFormData] = useState<FormDataState>({
    titleAr: "",
    titleEn: "",
    descriptionAr: "",
    descriptionEn: "",
    projectType: "sukuk",
    status: "draft",
    issueNumber: `MAE-${Date.now().toString().slice(-6)}`,
    locationAr: "",
    locationEn: "",
    coverImage: "",
    galleryText: "",
    targetAmount: "",
    currentAmount: "0",
    minInvestment: "",
    annualReturn: "",
    duration: "",
    investorsCount: "0",
    progressMode: "hybrid",
    progressFundingWeight: "60",
    progressMilestonesWeight: "40",
    featured: "false",
    isVip: "false",
    vipTier: "none",
  });

  const [highlightRows, setHighlightRows] = useState<string[]>([""]);
  const [attachmentRows, setAttachmentRows] = useState([newAttachmentRow()]);
  const [milestoneRows, setMilestoneRows] = useState([newMilestoneRow()]);
  const [faqRows, setFaqRows] = useState([newFaqRow()]);

  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);
  const filledHighlights = useMemo(
    () => highlightRows.filter((item) => cleanStr(item)).length,
    [highlightRows]
  );
  const filledAttachments = useMemo(
    () =>
      attachmentRows.filter(
        (row) => cleanStr(row.name) || cleanStr(row.url) || cleanStr(row.externalUrl)
      ).length,
    [attachmentRows]
  );
  const filledMilestones = useMemo(
    () =>
      milestoneRows.filter(
        (row) =>
          cleanStr(row.title) ||
          cleanStr(row.date) ||
          cleanStr(row.status) ||
          cleanStr(row.description)
      ).length,
    [milestoneRows]
  );
  const filledFaq = useMemo(
    () => faqRows.filter((row) => cleanStr(row.q) || cleanStr(row.a)).length,
    [faqRows]
  );
  const requiredReady = useMemo(
    () =>
      [formData.titleAr, formData.descriptionAr, formData.locationAr, formData.coverImage].filter(
        (value) => cleanStr(value)
      ).length,
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );
  const totalAssets = useMemo(
    () => (cleanStr(formData.coverImage) ? 1 : 0) + galleryUrls.length + filledAttachments,
    [filledAttachments, formData.coverImage, galleryUrls.length]
  );
  const progressWeightsTotal = useMemo(
    () =>
      toNumOrZero(formData.progressFundingWeight) +
      toNumOrZero(formData.progressMilestonesWeight),
    [formData.progressFundingWeight, formData.progressMilestonesWeight]
  );
  const isBusy = saving || coverUploading || galleryUploading;
  const hasUploadingAttachment = attachmentRows.some((row) => row.uploading);

  const sectionMeta = useMemo<Record<string, string>>(
    () => ({
      basic: cleanStr(formData.titleAr) ? "تمت إضافة هوية المشروع" : "ابدأ بالعنوان والوصف",
      details: cleanStr(formData.locationAr)
        ? `${projectTypeLabels[formData.projectType]} · ${statusLabels[formData.status]}`
        : "النوع والحالة والموقع",
      media: cleanStr(formData.coverImage) ? `${galleryUrls.length + 1} أصل بصري` : "أضف صورة الغلاف أولًا",
      highlights: filledHighlights ? `${filledHighlights} مميزات` : "لا توجد مميزات بعد",
      attachments: filledAttachments ? `${filledAttachments} مرفقات` : "لا توجد مرفقات بعد",
      milestones: filledMilestones ? `${filledMilestones} مراحل` : "لا توجد مراحل بعد",
      faq: filledFaq ? `${filledFaq} أسئلة` : "أضف الأسئلة الشائعة",
      finance: cleanStr(formData.targetAmount) ? `${cleanStr(formData.targetAmount)} ر.س` : "أضف الأرقام المالية",
      progress: progressModeLabels[formData.progressMode as ProgressMode],
      options:
        formData.isVip === "true" || formData.projectType === "vip_exclusive"
          ? `VIP ${vipTierLabels[formData.vipTier]}`
          : formData.featured === "true"
            ? "مشروع مميز"
            : "إعدادات افتراضية",
    }),
    [
      filledAttachments,
      filledFaq,
      filledHighlights,
      filledMilestones,
      formData.coverImage,
      formData.featured,
      formData.isVip,
      formData.locationAr,
      formData.progressMode,
      formData.projectType,
      formData.status,
      formData.targetAmount,
      formData.titleAr,
      formData.vipTier,
      galleryUrls.length,
    ]
  );

  const requiredChecklist = useMemo(
    () => [
      { label: "العنوان العربي", ready: Boolean(cleanStr(formData.titleAr)) },
      { label: "الوصف العربي", ready: Boolean(cleanStr(formData.descriptionAr)) },
      { label: "الموقع العربي", ready: Boolean(cleanStr(formData.locationAr)) },
      { label: "صورة الغلاف", ready: Boolean(cleanStr(formData.coverImage)) },
    ],
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );

  useEffect(() => {
    const sectionElements = SECTION_DEFINITIONS.map((section) =>
      document.getElementById(section.id)
    ).filter((element): element is HTMLElement => Boolean(element));
    if (!sectionElements.length) return;

    let frameId = 0;

    const updateActiveSectionFromScroll = () => {
      frameId = 0;

      const navElement = document.querySelector<HTMLElement>("[data-project-section-nav]");
      const probeY = navElement
        ? navElement.getBoundingClientRect().bottom + 24
        : Math.min(window.innerHeight * 0.24, 220);

      let nextActiveSection = sectionElements[0]?.id ?? SECTION_DEFINITIONS[0]?.id ?? "basic";

      for (const section of sectionElements) {
        if (section.getBoundingClientRect().top <= probeY) {
          nextActiveSection = section.id;
          continue;
        }
        break;
      }

      setActiveSection((prev) => (prev === nextActiveSection ? prev : nextActiveSection));
    };

    const scheduleActiveSectionUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActiveSectionFromScroll);
    };

    const navElement = document.querySelector<HTMLElement>("[data-project-section-nav]");
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleActiveSectionUpdate();
          })
        : null;

    window.addEventListener("scroll", scheduleActiveSectionUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveSectionUpdate);

    resizeObserver?.observe(document.body);
    navElement ? resizeObserver?.observe(navElement) : null;
    sectionElements.forEach((element) => resizeObserver?.observe(element));

    scheduleActiveSectionUpdate();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleActiveSectionUpdate);
      window.removeEventListener("resize", scheduleActiveSectionUpdate);
      resizeObserver?.disconnect();
    };
  }, []);

  const handleAttachmentFileUpload = async (index: number, file?: File | null) => {
    if (!file) return;
    try {
      setAttachmentRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, uploading: true } : row)));
      const uploaded = await uploadInvestmentDocument({
        entityType: "project",
        entityId: draftProjectId,
        category: "project_attachment",
        projectId: draftProjectId,
        file,
        kind: "attachment",
      });
      const url = uploaded.fileUrl;
      if (!url) throw new Error("Upload failed");
      setAttachmentRows((prev) =>
        prev.map((row, rowIndex) =>
          rowIndex === index ? { ...row, uploading: false, url, name: row.name || file.name } : row
        )
      );
      toast.success("تم رفع الملف بنجاح");
    } catch (error) {
      console.error(error);
      setAttachmentRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, uploading: false } : row)));
      toast.error("فشل رفع الملف");
    }
  };

  const handleCoverImageUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      setCoverUploading(true);
      const uploaded = await uploadInvestmentDocument({
        entityType: "project",
        entityId: draftProjectId,
        category: "project_cover",
        projectId: draftProjectId,
        file,
        kind: "attachment",
      });
      const url = uploaded.fileUrl;
      if (!url) throw new Error("Upload failed");
      setFormData((prev) => ({ ...prev, coverImage: url }));
      toast.success("تم رفع صورة الغلاف بنجاح");
    } catch (error) {
      console.error(error);
      toast.error("فشل رفع صورة الغلاف");
    } finally {
      setCoverUploading(false);
    }
  };

  const handleGalleryImageUpload = async (files?: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    try {
      setGalleryUploading(true);
      const uploadedUrls = await Promise.all(
        selected.map(async (file) => {
          const uploaded = await uploadInvestmentDocument({
            entityType: "project",
            entityId: draftProjectId,
            category: "project_gallery",
            projectId: draftProjectId,
            file,
            kind: "attachment",
          });
          const url = uploaded.fileUrl;
          if (!url) throw new Error("Upload failed");
          return url;
        })
      );
      setFormData((prev) => {
        const current = prev.galleryText.trim();
        const appended = uploadedUrls.join("\n");
        return { ...prev, galleryText: current ? `${current}\n${appended}` : appended };
      });
      toast.success(
        selected.length === 1
          ? "تم رفع صورة المعرض بنجاح"
          : `تم رفع ${selected.length} صور للمعرض بنجاح`
      );
    } catch (error) {
      console.error(error);
      toast.error("فشل رفع صور المعرض");
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!cleanStr(formData.titleAr)) return toast.error("عنوان المشروع (عربي) مطلوب");
    if (!cleanStr(formData.descriptionAr)) return toast.error("الوصف (عربي) مطلوب");
    if (!cleanStr(formData.locationAr)) return toast.error("الموقع (عربي) مطلوب");
    if (!cleanStr(formData.coverImage)) return toast.error("صورة الغلاف مطلوبة");
    if (attachmentRows.some((row) => row.uploading)) return toast.warning("انتظر حتى يكتمل رفع المرفقات.");
    if (coverUploading || galleryUploading) return toast.warning("انتظر حتى يكتمل رفع الصور.");

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) return toast.error(`المرفقات: ${parsedAttachments.errors[0]}`);
    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) return toast.error(`المراحل: ${parsedMilestones.errors[0]}`);
    const parsedFaq = parseFaqRows(faqRows);
    if (parsedFaq.errors.length) return toast.error(`الأسئلة الشائعة: ${parsedFaq.errors[0]}`);

    const titleAr = cleanStr(formData.titleAr);
    const titleEn = cleanStr(formData.titleEn);
    const descAr = cleanStr(formData.descriptionAr);
    const descEn = cleanStr(formData.descriptionEn);
    const locAr = cleanStr(formData.locationAr);
    const locEn = cleanStr(formData.locationEn);
    const issueNumber = cleanStr(formData.issueNumber) || `MAE-${Date.now().toString().slice(-6)}`;
    const isVip = formData.isVip === "true" || formData.projectType === "vip_exclusive";

    try {
      setSaving(true);
      const projectRef = doc(db, "projects", draftProjectId);
      const payload = {
        issueNumber,
        titleAr,
        titleEn,
        title: titleEn || titleAr,
        descriptionAr: descAr,
        descriptionEn: descEn,
        description: descEn || descAr,
        overviewAr: descAr,
        projectType: formData.projectType,
        status: formData.status,
        locationAr: locAr,
        locationEn: locEn,
        location: locEn || locAr,
        coverImage: cleanStr(formData.coverImage),
        gallery: galleryUrls,
        images: galleryUrls,
        highlights: highlightRows.map((item) => cleanStr(item)).filter(Boolean),
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,
        targetAmount: toNumOrZero(formData.targetAmount),
        currentAmount: toNumOrZero(formData.currentAmount),
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        investmentReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),
        investorsCount: toNumOrZero(formData.investorsCount),
        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),
        featured: formData.featured === "true",
        isVip,
        vipOnly: isVip,
        vipTier: formData.vipTier,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await auditedSetDoc({
        ref: projectRef,
        data: payload,
        action: AUDIT_ACTIONS.PROJECT_CREATED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({ area: "admin", page: "CreateProject", method: "create" }),
        relatedIds: { projectId: draftProjectId },
        message: `Created project ${titleAr || titleEn || draftProjectId}`,
        meta: {
          projectName: titleAr || titleEn || draftProjectId,
          issueNumber,
          status: formData.status,
          projectType: formData.projectType,
        },
        ignoreFields: ["updatedAt"],
      });
      toast.success("تم إنشاء المشروع بنجاح");
      setLocation("/admin/projects");
    } catch (error) {
      console.error(error);
      toast.error("فشل إنشاء المشروع");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <CreateProjectUi
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        attachmentRows={attachmentRows}
        coverUploading={coverUploading}
        draftProjectId={draftProjectId}
        faqRows={faqRows}
        filledAttachments={filledAttachments}
        filledFaq={filledFaq}
        filledHighlights={filledHighlights}
        filledMilestones={filledMilestones}
        formData={formData}
        galleryUploading={galleryUploading}
        galleryUrls={galleryUrls}
        handleAttachmentFileUpload={handleAttachmentFileUpload}
        handleCoverImageUpload={handleCoverImageUpload}
        handleGalleryImageUpload={handleGalleryImageUpload}
        handleSubmit={handleSubmit}
        hasUploadingAttachment={hasUploadingAttachment}
        highlightRows={highlightRows}
        isBusy={isBusy}
        milestoneRows={milestoneRows}
        progressWeightsTotal={progressWeightsTotal}
        requiredChecklist={requiredChecklist}
        requiredReady={requiredReady}
        sectionMeta={sectionMeta}
        setAttachmentRows={setAttachmentRows}
        setFaqRows={setFaqRows}
        setFormData={setFormData}
        setHighlightRows={setHighlightRows}
        setLocation={setLocation}
        setMilestoneRows={setMilestoneRows}
        saving={saving}
        totalAssets={totalAssets}
      />
    </DashboardLayout>
  );
}
