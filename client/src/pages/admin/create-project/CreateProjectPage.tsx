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
  FINAL_SETTINGS_SECTION_ID,
  SECTION_DEFINITIONS,
  buildFinalSettingsMeta,
  buildSectionStatusMap,
  buildCompletionContentPayload,
  cleanStr,
  newAttachmentRow,
  newCompletionOutputRow,
  newFaqRow,
  newMilestoneRow,
  normalizeProjectBuilderSectionId,
  parseAttachmentRows,
  parseFaqRows,
  parseMilestoneRows,
  projectTypeLabels,
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

  const galleryUrls = useMemo(() => splitLines(formData.galleryText), [formData.galleryText]);
  const completionGalleryUrls = useMemo(
    () => splitLines(formData.completionGalleryText),
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
      basic: cleanStr(formData.titleAr) ? "طھظ…طھ ط¥ط¶ط§ظپط© ظ‡ظˆظٹط© ط§ظ„ظ…ط´ط±ظˆط¹" : "ط§ط¨ط¯ط£ ط¨ط§ظ„ط¹ظ†ظˆط§ظ† ظˆط§ظ„ظˆطµظپ",
      details: cleanStr(formData.locationAr)
        ? `${projectTypeLabels[formData.projectType]} آ· ${statusLabels[formData.status]}`
        : "ط§ظ„ظ†ظˆط¹ ظˆط§ظ„ط­ط§ظ„ط© ظˆط§ظ„ظ…ظˆظ‚ط¹",
      media: cleanStr(formData.coverImage) ? `${galleryUrls.length + 1} ط£طµظ„ ط¨طµط±ظٹ` : "ط£ط¶ظپ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ ط£ظˆظ„ظ‹ط§",
      highlights: filledHighlights ? `${filledHighlights} ظ…ظ…ظٹط²ط§طھ` : "ظ„ط§ طھظˆط¬ط¯ ظ…ظ…ظٹط²ط§طھ ط¨ط¹ط¯",
      attachments: filledAttachments ? `${filledAttachments} ظ…ط±ظپظ‚ط§طھ` : "ظ„ط§ طھظˆط¬ط¯ ظ…ط±ظپظ‚ط§طھ ط¨ط¹ط¯",
      milestones: filledMilestones ? `${filledMilestones} ظ…ط±ط§ط­ظ„` : "ظ„ط§ طھظˆط¬ط¯ ظ…ط±ط§ط­ظ„ ط¨ط¹ط¯",
      faq: filledFaq ? `${filledFaq} ط£ط³ط¦ظ„ط©` : "ط£ط¶ظپ ط§ظ„ط£ط³ط¦ظ„ط© ط§ظ„ط´ط§ط¦ط¹ط©",
      finance: cleanStr(formData.targetAmount) ? `${cleanStr(formData.targetAmount)} ط±.ط³` : "ط£ط¶ظپ ط§ظ„ط£ط±ظ‚ط§ظ… ط§ظ„ظ…ط§ظ„ظٹط©",
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
      { label: "ط§ظ„ط¹ظ†ظˆط§ظ† ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.titleAr)) },
      { label: "ط§ظ„ظˆطµظپ ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.descriptionAr)) },
      { label: "ط§ظ„ظ…ظˆظ‚ط¹ ط§ظ„ط¹ط±ط¨ظٹ", ready: Boolean(cleanStr(formData.locationAr)) },
      { label: "طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ", ready: Boolean(cleanStr(formData.coverImage)) },
    ],
    [formData.coverImage, formData.descriptionAr, formData.locationAr, formData.titleAr]
  );

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

  useEffect(() => {
    const sectionElements = visibleSections.map((section) =>
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

      let nextActiveSection = sectionElements[0]?.id ?? visibleSections[0]?.id ?? "basic";

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
  }, [visibleSections]);

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
      toast.success("طھظ… ط±ظپط¹ ط§ظ„ظ…ظ„ظپ ط¨ظ†ط¬ط§ط­");
    } catch (error) {
      console.error(error);
      setAttachmentRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, uploading: false } : row)));
      toast.error("ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ");
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
      toast.success("طھظ… ط±ظپط¹ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ ط¨ظ†ط¬ط§ط­");
    } catch (error) {
      console.error(error);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ");
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
          ? "طھظ… ط±ظپط¹ طµظˆط±ط© ط§ظ„ظ…ط¹ط±ط¶ ط¨ظ†ط¬ط§ط­"
          : `طھظ… ط±ظپط¹ ${selected.length} طµظˆط± ظ„ظ„ظ…ط¹ط±ط¶ ط¨ظ†ط¬ط§ط­`
      );
    } catch (error) {
      console.error(error);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط± ط§ظ„ظ…ط¹ط±ط¶");
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
          ? "طھظ… ط±ظپط¹ طµظˆط±ط© ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ط¨ظ†ط¬ط§ط­"
          : `طھظ… ط±ظپط¹ ${selected.length} طµظˆط± ظ„ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹ ط¨ظ†ط¬ط§ط­`
      );
    } catch (error) {
      console.error(error);
      toast.error("ظپط´ظ„ ط±ظپط¹ طµظˆط± ظ†طھط§ط¦ط¬ ط§ظ„ظ…ط´ط±ظˆط¹");
    } finally {
      setCompletionGalleryUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    if (!cleanStr(formData.titleAr)) {
      toast.error("ط¹ظ†ظˆط§ظ† ط§ظ„ظ…ط´ط±ظˆط¹ (ط¹ط±ط¨ظٹ) ظ…ط·ظ„ظˆط¨");
      return;
    }
    if (!cleanStr(formData.descriptionAr)) {
      toast.error("ط§ظ„ظˆطµظپ (ط¹ط±ط¨ظٹ) ظ…ط·ظ„ظˆط¨");
      return;
    }
    if (!cleanStr(formData.locationAr)) {
      toast.error("ط§ظ„ظ…ظˆظ‚ط¹ (ط¹ط±ط¨ظٹ) ظ…ط·ظ„ظˆط¨");
      return;
    }
    if (!cleanStr(formData.coverImage)) {
      toast.error("طµظˆط±ط© ط§ظ„ط؛ظ„ط§ظپ ظ…ط·ظ„ظˆط¨ط©");
      return;
    }
    if (attachmentRows.some((row) => row.uploading)) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„ظ…ط±ظپظ‚ط§طھ.");
      return;
    }
    if (coverUploading || galleryUploading) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„طµظˆط±.");
      return;
    }

    if (completionGalleryUploading) {
      toast.warning("ط§ظ†طھط¸ط± ط­طھظ‰ ظٹظƒطھظ…ظ„ ط±ظپط¹ ط§ظ„طµظˆط±.");
      return;
    }

    const parsedAttachments = parseAttachmentRows(attachmentRows);
    if (parsedAttachments.errors.length) {
      toast.error(`ط§ظ„ظ…ط±ظپظ‚ط§طھ: ${parsedAttachments.errors[0]}`);
      return;
    }
    const parsedMilestones = parseMilestoneRows(milestoneRows);
    if (parsedMilestones.errors.length) {
      toast.error(`ط§ظ„ظ…ط±ط§ط­ظ„: ${parsedMilestones.errors[0]}`);
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
      toast.error(`ط§ظ„ط£ط³ط¦ظ„ط© ط§ظ„ط´ط§ط¦ط¹ط©: ${parsedFaq.errors[0]}`);
      return;
    }

    if (completionPayload.errors.length) {
      toast.error(`ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ط®طھط§ظ…ظٹ: ${completionPayload.errors[0]}`);
      return;
    }

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
        ...(completionPayload.value ? { completionContent: completionPayload.value } : {}),
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
      toast.success("طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظˆط¹ ط¨ظ†ط¬ط§ط­");
      setLocation("/admin/projects");
    } catch (error) {
      console.error(error);
      toast.error("ظپط´ظ„ ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط´ط±ظˆط¹");
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
      />
    </DashboardLayout>
  );
}

