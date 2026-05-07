import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  buildAuditSource,
  runAuditedOperation,
} from "@/lib/auditLog";
import { reserveNextBusinessId } from "@/lib/businessIds";
import { uploadInvestmentDocument } from "@/lib/documentUploadService";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";
import { CreateProjectUi } from "./CreateProjectUi";
import {
  FINAL_SETTINGS_SECTION_ID,
  SECTION_DEFINITIONS,
  buildFinalSettingsMeta,
  buildCoverageAmounts,
  buildSectionStatusMap,
  buildCompletionContentPayload,
  cleanStr,
  newAttachmentRow,
  newCompletionOutputRow,
  newFaqRow,
  newMilestoneRow,
  normalizePublicAssetPath,
  normalizeProjectBuilderSectionId,
  parseAttachmentRows,
  parseFaqRows,
  parseMilestoneRows,
  projectTypeLabels,
  serializeProjectEditorSnapshot,
  splitLines,
  statusLabels,
  toNumOrZero,
  type FormDataState,
} from "./shared";

export default function CreateProjectPage() {
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [draftProjectId] = useState(() => doc(collection(db, "projects")).id);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [completionGalleryUploading, setCompletionGalleryUploading] = useState(false);
  const [activeSection, setActiveSection] = useState(SECTION_DEFINITIONS[0]?.id ?? "basic");

  const [formData, setFormData] = useState<FormDataState>({
    titleAr: "",
    titleEn: "",
    descriptionAr: "",
    descriptionEn: "",
    projectType: "sukuk",
    status: "draft",
    issueNumber: "",
    locationAr: "",
    locationEn: "",
    coverImage: "",
    galleryText: "",
    targetAmount: "",
    currentAmount: "0",
    coverageRate: "0",
    investmentsAmount: "0",
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
    completionOverviewAr: "",
    completionSummaryAr: "",
    completionGalleryText: "",
  });

  const [highlightRows, setHighlightRows] = useState<string[]>([""]);
  const [attachmentRows, setAttachmentRows] = useState([newAttachmentRow()]);
  const [milestoneRows, setMilestoneRows] = useState([newMilestoneRow()]);
  const [faqRows, setFaqRows] = useState([newFaqRow()]);
  const [completionResultRows, setCompletionResultRows] = useState<string[]>([""]);
  const [completionOutputRows, setCompletionOutputRows] = useState([
    newCompletionOutputRow(),
  ]);
  const [completionFinalNoteRows, setCompletionFinalNoteRows] = useState<string[]>([""]);

  const galleryUrls = useMemo(
    () => splitLines(formData.galleryText).map(normalizePublicAssetPath),
    [formData.galleryText]
  );
  const completionGalleryUrls = useMemo(
    () => splitLines(formData.completionGalleryText).map(normalizePublicAssetPath),
    [formData.completionGalleryText]
  );
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
  const filledCompletionResults = useMemo(
    () => completionResultRows.filter((item) => cleanStr(item)).length,
    [completionResultRows]
  );
  const filledCompletionOutputs = useMemo(
    () =>
      completionOutputRows.filter(
        (row) => cleanStr(row.titleAr) || cleanStr(row.descriptionAr) || cleanStr(row.metaAr)
      ).length,
    [completionOutputRows]
  );
  const filledCompletionFinalNotes = useMemo(
    () => completionFinalNoteRows.filter((item) => cleanStr(item)).length,
    [completionFinalNoteRows]
  );
  const requiredReady = useMemo(
    () =>
      [formData.titleAr, formData.descriptionAr, formData.locationAr, formData.coverImage].filter(
        (value) => cleanStr(value)
      ).length,
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );
  const totalAssets = useMemo(
    () =>
      (cleanStr(formData.coverImage) ? 1 : 0) +
      galleryUrls.length +
      completionGalleryUrls.length +
      filledAttachments,
    [completionGalleryUrls.length, filledAttachments, formData.coverImage, galleryUrls.length]
  );
  const progressWeightsTotal = useMemo(
    () =>
      toNumOrZero(formData.progressFundingWeight) +
      toNumOrZero(formData.progressMilestonesWeight),
    [formData.progressFundingWeight, formData.progressMilestonesWeight]
  );
  const isBusy = saving || coverUploading || galleryUploading || completionGalleryUploading;
  const hasUploadingAttachment = attachmentRows.some((row) => row.uploading);
  const visibleSections = useMemo(() => SECTION_DEFINITIONS, []);

  const finalSettingsSectionMeta = useMemo(
    () =>
      buildFinalSettingsMeta({
        formData,
        filledCompletionResults,
        filledCompletionOutputs,
        filledCompletionFinalNotes,
      }),
    [
      filledCompletionFinalNotes,
      filledCompletionOutputs,
      filledCompletionResults,
      formData,
    ]
  );
  const sectionMeta = useMemo<Record<string, string>>(
    () => ({
      basic: cleanStr(formData.titleAr) ? "تمت إضافة هوية المشروع" : "ابدأ بالعنوان والوصف",
      details: cleanStr(formData.locationAr)
        ? `${projectTypeLabels[formData.projectType]} · ${statusLabels[formData.status]}`
        : "النوع والحالة والموقع",
      media: cleanStr(formData.coverImage)
        ? `${galleryUrls.length + 1} أصل بصري`
        : "أضف صورة الغلاف أولًا",
      highlights: filledHighlights ? `${filledHighlights} مميزات` : "لا توجد مميزات بعد",
      attachments: filledAttachments ? `${filledAttachments} مرفقات` : "لا توجد مرفقات بعد",
      milestones: filledMilestones ? `${filledMilestones} مراحل` : "لا توجد مراحل بعد",
      faq: filledFaq ? `${filledFaq} أسئلة` : "أضف الأسئلة الشائعة",
      finance: cleanStr(formData.targetAmount)
        ? `${cleanStr(formData.targetAmount)} ر.س`
        : "أضف الأرقام المالية",
      [FINAL_SETTINGS_SECTION_ID]: finalSettingsSectionMeta,
    }),
    [
      filledAttachments,
      filledFaq,
      filledHighlights,
      filledMilestones,
      finalSettingsSectionMeta,
      formData.coverImage,
      formData.locationAr,
      formData.projectType,
      formData.status,
      formData.targetAmount,
      formData.titleAr,
      galleryUrls.length,
    ]
  );
  const sectionStatuses = useMemo(
    () =>
      buildSectionStatusMap({
        formData,
        highlightRows,
        attachmentRows,
        milestoneRows,
        faqRows,
        completionResultRows,
        completionOutputRows,
        completionFinalNoteRows,
        completionGalleryUrls,
      }),
    [
      attachmentRows,
      completionFinalNoteRows,
      completionGalleryUrls,
      completionOutputRows,
      completionResultRows,
      faqRows,
      formData,
      highlightRows,
      milestoneRows,
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
  const currentSnapshot = useMemo(
    () =>
      serializeProjectEditorSnapshot({
        formData,
        highlightRows,
        attachmentRows,
        milestoneRows,
        faqRows,
        completionResultRows,
        completionOutputRows,
        completionFinalNoteRows,
      }),
    [
      attachmentRows,
      completionFinalNoteRows,
      completionOutputRows,
      completionResultRows,
      faqRows,
      formData,
      highlightRows,
      milestoneRows,
    ]
  );
  const initialSnapshot = useMemo(
    () =>
      serializeProjectEditorSnapshot({
        formData: {
          titleAr: "",
          titleEn: "",
          descriptionAr: "",
          descriptionEn: "",
          projectType: "sukuk",
          status: "draft",
          issueNumber: "",
          locationAr: "",
          locationEn: "",
          coverImage: "",
          galleryText: "",
          targetAmount: "",
          currentAmount: "0",
          coverageRate: "0",
          investmentsAmount: "0",
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
          completionOverviewAr: "",
          completionSummaryAr: "",
          completionGalleryText: "",
        },
        highlightRows: [""],
        attachmentRows: [newAttachmentRow()],
        milestoneRows: [newMilestoneRow()],
        faqRows: [newFaqRow()],
        completionResultRows: [""],
        completionOutputRows: [newCompletionOutputRow()],
        completionFinalNoteRows: [""],
      }),
    []
  );
  const isDirty = currentSnapshot !== initialSnapshot;

  useEffect(() => {
    const normalizedActiveSection = normalizeProjectBuilderSectionId(activeSection);
    if (normalizedActiveSection && normalizedActiveSection !== activeSection) {
      setActiveSection(normalizedActiveSection);
      return;
    }

    if (!visibleSections.some((section) => section.id === normalizedActiveSection)) {
      setActiveSection(visibleSections[0]?.id ?? "basic");
    }
  }, [activeSection, visibleSections]);

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

  const handleCompletionGalleryImageUpload = async (files?: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;

    try {
      setCompletionGalleryUploading(true);
      const uploadedUrls = await Promise.all(
        selected.map(async (file) => {
          const uploaded = await uploadInvestmentDocument({
            entityType: "project",
            entityId: draftProjectId,
            category: "project_completion_gallery",
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
        const current = prev.completionGalleryText.trim();
        const appended = uploadedUrls.join("\n");
        return {
          ...prev,
          completionGalleryText: current ? `${current}\n${appended}` : appended,
        };
      });

      toast.success(
        selected.length === 1
          ? "تم رفع صورة نتائج المشروع بنجاح"
          : `تم رفع ${selected.length} صور لنتائج المشروع بنجاح`
      );
    } catch (error) {
      console.error(error);
      toast.error("فشل رفع صور نتائج المشروع");
    } finally {
      setCompletionGalleryUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!cleanStr(formData.titleAr)) {
      toast.error("عنوان المشروع (عربي) مطلوب");
      return;
    }
    if (!cleanStr(formData.descriptionAr)) {
      toast.error("الوصف (عربي) مطلوب");
      return;
    }
    if (!cleanStr(formData.locationAr)) {
      toast.error("الموقع (عربي) مطلوب");
      return;
    }
    if (!cleanStr(formData.coverImage)) {
      toast.error("صورة الغلاف مطلوبة");
      return;
    }
    if (attachmentRows.some((row) => row.uploading)) {
      toast.warning("انتظر حتى يكتمل رفع المرفقات.");
      return;
    }
    if (coverUploading || galleryUploading) {
      toast.warning("انتظر حتى يكتمل رفع الصور.");
      return;
    }

    if (completionGalleryUploading) {
      toast.warning("انتظر حتى يكتمل رفع الصور.");
      return;
    }

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) {
      toast.error(`المرفقات: ${parsedAttachments.errors[0]}`);
      return;
    }
    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) {
      toast.error(`المراحل: ${parsedMilestones.errors[0]}`);
      return;
    }
    const parsedFaq = parseFaqRows(faqRows);
    const completionPayload = buildCompletionContentPayload({
      overviewAr: formData.completionOverviewAr,
      summaryAr: formData.completionSummaryAr,
      resultsAr: completionResultRows,
      outputRows: completionOutputRows,
      finalNotesAr: completionFinalNoteRows,
      gallery: completionGalleryUrls,
    });
    if (parsedFaq.errors.length) {
      toast.error(`الأسئلة الشائعة: ${parsedFaq.errors[0]}`);
      return;
    }

    if (completionPayload.errors.length) {
      toast.error(`المحتوى الختامي: ${completionPayload.errors[0]}`);
      return;
    }

    const titleAr = cleanStr(formData.titleAr);
    const titleEn = cleanStr(formData.titleEn);
    const descAr = cleanStr(formData.descriptionAr);
    const descEn = cleanStr(formData.descriptionEn);
    const locAr = cleanStr(formData.locationAr);
    const locEn = cleanStr(formData.locationEn);
    const issueNumber = cleanStr(formData.issueNumber);
    const isVip = formData.isVip === "true" || formData.projectType === "vip_exclusive";
    const coverageAmounts = buildCoverageAmounts({
      targetAmount: formData.targetAmount,
      coverageRate: formData.coverageRate,
      investmentsAmount: formData.investmentsAmount,
      minInvestment: formData.minInvestment,
    });

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
        coverImage: normalizePublicAssetPath(formData.coverImage),
        gallery: galleryUrls,
        images: galleryUrls,
        highlights: highlightRows.map((item) => cleanStr(item)).filter(Boolean),
        attachments: parsedAttachments.items,
        milestones: parsedMilestones.items,
        faq: parsedFaq.items,
        targetAmount: toNumOrZero(formData.targetAmount),
        coverageRate: toNumOrZero(formData.coverageRate),
        baseCoveredAmount: coverageAmounts.baseCoveredAmount,
        investmentsAmount: coverageAmounts.investmentsAmount,
        currentAmount: coverageAmounts.currentAmount,
        minInvestment: toNumOrZero(formData.minInvestment),
        annualReturn: toNumOrZero(formData.annualReturn),
        investmentReturn: toNumOrZero(formData.annualReturn),
        duration: toNumOrZero(formData.duration),
        investorsCount: 0,
        remainingInvestorsCount: coverageAmounts.remainingInvestorsCount,
        progressMode: formData.progressMode,
        progressFundingWeight: toNumOrZero(formData.progressFundingWeight),
        progressMilestonesWeight: toNumOrZero(formData.progressMilestonesWeight),
        featured: formData.featured === "true",
        isVip,
        vipOnly: isVip,
        vipTier: formData.vipTier,
        ...(completionPayload.value ? { completionContent: completionPayload.value } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const businessId = await runAuditedOperation<string>({
        action: AUDIT_ACTIONS.PROJECT_CREATED,
        category: "project",
        entityType: "project",
        source: buildAuditSource({ area: "admin", page: "CreateProject", method: "create" }),
        relatedIds: { projectId: draftProjectId },
        message: ({ result }) => `Created project ${result}`,
        meta: ({ result }) => ({
          businessId: result,
          projectName: titleAr || titleEn || result,
          issueNumber: issueNumber || null,
          status: formData.status,
          projectType: formData.projectType,
        }),
        targets: [{ ref: projectRef, entityType: "project" }],
        ignoreFields: ["updatedAt"],
        execute: async () =>
          runTransaction(db, async (tx) => {
            const businessId = await reserveNextBusinessId(tx, "projects");
            tx.set(projectRef, {
              ...payload,
              businessId,
            });
            return businessId;
          }),
      });
      toast.success(`تم إنشاء المشروع بنجاح تحت الرقم ${businessId}`);
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
        completionFinalNoteRows={completionFinalNoteRows}
        completionGalleryUploading={completionGalleryUploading}
        completionGalleryUrls={completionGalleryUrls}
        completionOutputRows={completionOutputRows}
        completionResultRows={completionResultRows}
        coverUploading={coverUploading}
        draftProjectId={draftProjectId}
        faqRows={faqRows}
        filledCompletionFinalNotes={filledCompletionFinalNotes}
        filledCompletionOutputs={filledCompletionOutputs}
        filledCompletionResults={filledCompletionResults}
        filledAttachments={filledAttachments}
        filledFaq={filledFaq}
        filledHighlights={filledHighlights}
        filledMilestones={filledMilestones}
        formData={formData}
        galleryUploading={galleryUploading}
        galleryUrls={galleryUrls}
        handleAttachmentFileUpload={handleAttachmentFileUpload}
        handleCompletionGalleryImageUpload={handleCompletionGalleryImageUpload}
        handleCoverImageUpload={handleCoverImageUpload}
        handleGalleryImageUpload={handleGalleryImageUpload}
        handleSubmit={handleSubmit}
        hasUploadingAttachment={hasUploadingAttachment}
        highlightRows={highlightRows}
        isBusy={isBusy}
        isDirty={isDirty}
        milestoneRows={milestoneRows}
        progressWeightsTotal={progressWeightsTotal}
        requiredChecklist={requiredChecklist}
        requiredReady={requiredReady}
        sectionMeta={sectionMeta}
        sectionStatuses={sectionStatuses}
        setAttachmentRows={setAttachmentRows}
        setCompletionFinalNoteRows={setCompletionFinalNoteRows}
        setCompletionOutputRows={setCompletionOutputRows}
        setCompletionResultRows={setCompletionResultRows}
        setFaqRows={setFaqRows}
        setFormData={setFormData}
        setHighlightRows={setHighlightRows}
        setLocation={setLocation}
        setMilestoneRows={setMilestoneRows}
        saving={saving}
        totalAssets={totalAssets}
        workspaceIdLabel="المعرف التجاري"
        workspaceIdValue="سيُولّد عند الحفظ"
      />
    </DashboardLayout>
  );
}

