/**
 * Unified type exports for Firestore collections
 * ✅ This file is the single source of truth for Firestore contracts
 */

import { Timestamp } from "firebase/firestore";

/* =========================
   Project / Investment Enums
========================= */

export type ProjectStatus = "draft" | "published" | "closed" | "completed";
export type ProjectType = "sukuk" | "land_development" | "vip_exclusive";

export const OFFICIAL_INVESTMENT_STATUSES = [
  "pending",
  "pending_contract",
  "signing",
  "signed",
  "active",
  "completed",
  "rejected",
  "cancelled",
] as const;

export type InvestmentStatus = (typeof OFFICIAL_INVESTMENT_STATUSES)[number];

export const COUNTED_INVESTMENT_STATUSES = [
  "signed",
  "active",
  "completed",
] as const;
export type CountedInvestmentStatus =
  (typeof COUNTED_INVESTMENT_STATUSES)[number];

export const PENDING_INVESTMENT_STATUSES = [
  "pending",
  "pending_contract",
  "signing",
] as const;
export type PendingInvestmentStatus =
  (typeof PENDING_INVESTMENT_STATUSES)[number];

export const LEGACY_INVESTMENT_STATUS_MAP: Record<string, InvestmentStatus> = {
  approved: "signed",
  pending_review: "pending",
};

export function normalizeInvestmentStatus(
  raw: unknown
): InvestmentStatus | null {
  const r = String(raw ?? "").trim().toLowerCase();
  if ((OFFICIAL_INVESTMENT_STATUSES as readonly string[]).includes(r)) {
    return r as InvestmentStatus;
  }
  if (LEGACY_INVESTMENT_STATUS_MAP[r]) return LEGACY_INVESTMENT_STATUS_MAP[r];
  return null;
}

export function isCountedInvestmentStatus(
  raw: unknown
): raw is CountedInvestmentStatus {
  const normalized = normalizeInvestmentStatus(raw);
  return normalized
    ? (COUNTED_INVESTMENT_STATUSES as readonly string[]).includes(normalized)
    : false;
}

export function isPendingInvestmentStatus(
  raw: unknown
): raw is PendingInvestmentStatus {
  const normalized = normalizeInvestmentStatus(raw);
  return normalized
    ? (PENDING_INVESTMENT_STATUSES as readonly string[]).includes(normalized)
    : false;
}

/**
 * ✅ PayoutType (خطة الدفعات)
 * - monthly: شهري
 * - quarterly: ربع سنوي
 * - one_time: دفعة واحدة
 * - mixed: دوري + نهائي
 *
 * ملاحظة: عندك في الكود القديم "once" و "hybrid" — دعمناها كـ alias تحت.
 */
export type PayoutType = "monthly" | "quarterly" | "one_time" | "mixed";

/**
 * ✅ DelayPenaltyRule (قاعدة التأخير)
 * نحتاجها لاحقًا مع Cloud Functions.
 */
export type DelayPenaltyRule =
  | { mode: "none" }
  | { mode: "percent_per_day"; percentPerDay: number; maxPercent?: number }
  | { mode: "fixed_per_day"; amountPerDay: number; maxAmount?: number };

/* =========================
   Firestore Doc Shapes (Without id)
   ✅ هذا هو شكل المستند داخل Firestore
========================= */

export interface ProjectDoc {
  issueNumber: string;

  titleAr: string;
  titleEn?: string;

  descriptionAr: string;
  descriptionEn?: string;

  locationAr: string;
  locationEn?: string;

  projectType: ProjectType;
  status: ProjectStatus;

  // Financials
  targetAmount: number;
  currentAmount: number;
  pendingAmount?: number;
  minInvestment: number;
  annualReturn: number;

  /**
   * ✅ durationMonths = مدة الاستثمار بالمشروع (شهور)
   * (ابقينا duration موجودة كمان عشان ما ينكسر القديم)
   */
  durationMonths?: number;
  duration?: number; // legacy (months)

  investorsCount: number;

  // Media
  coverImage: string;
  gallery?: string[];

  // Timeline
  plannedLaunchAt?: Timestamp;
  actualLaunchAt?: Timestamp;
  plannedEndAt?: Timestamp;
  actualEndAt?: Timestamp;

  // Delay tracking (computed)
  launchDelayDays?: number;
  endDelayDays?: number;

  // Penalty rule (optional)
  delayPenaltyRule?: DelayPenaltyRule;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvestmentDoc {
  projectId: string;

  // Optional snapshots (helpful to avoid breaking old UI when project changes)
  projectTitle?: string;
  projectTitleAtSign?: string;

  investorUid: string;
  investorName: string;

  amount: number;
  status: InvestmentStatus;

  /**
   * ✅ payoutType (موحد حسب الخطة)
   * - ندعم aliases: once => one_time, hybrid => mixed
   */
  payoutType: PayoutType;

  /**
   * لو payoutType = mixed
   * periodicAmount = مبلغ دوري
   * finalAmount = مبلغ نهائي
   */
  periodicAmount?: number;
  finalAmount?: number;

  /**
   * ✅ بداية الاستثمار الفعلية = signedAt
   * ملاحظة: خليناه optional عشان ما نكسر بيانات قديمة pending/signing
   * لكن عند signed/active لازم يكون موجود (نفرضها في الكود/validation لاحقًا)
   */
  signedAt?: Timestamp;

  /**
   * ✅ مدة استثمار العميل (بالشهور)
   * نثبتها هنا لأن الخطة تعتمد عليها للحساب
   */
  durationMonths?: number;

  // Delay compensation
  delayPenaltyApplied?: boolean;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InvestorMeta {
  totalInvested: number;
  activeInvestmentsCount: number;
}

/**
 * ✅ users/{uid} meta document (شكل مرن)
 * - نخلي investorMeta optional
 * - نخلي role/vipStatus كما عندك
 */
export interface UserMetaDoc {
  investorMeta?: InvestorMeta;

  vipStatus: "none" | "vip";
  role: "client" | "admin" | "guest";
}

/* =========================
   Current App Types (With id)
   ✅ هذه هي الأنواع المستخدمة داخل الواجهة (مع id)
========================= */

export interface Project extends ProjectDoc {
  id: string;
}

export interface Investment extends InvestmentDoc {
  id: string;

  /**
   * ✅ Legacy field compatibility
   * الكود القديم عندك يستخدم:
   * paymentFrequency: "monthly" | "quarterly" | "once" | "hybrid"
   * خليناه موجود كـ alias حتى ما نكسر أي صفحة قديمة.
   */
  paymentFrequency?: "monthly" | "quarterly" | "once" | "hybrid";
}

/* =========================
   Compatibility Helpers Types
   ✅ يسهّل علينا الانتقال بدون ما نخرب الواجهات
========================= */

/**
 * Converts legacy paymentFrequency to payoutType
 * (used later in services/normalization)
 */
export type LegacyPaymentFrequency = "monthly" | "quarterly" | "once" | "hybrid";

/* ========================= */

export * from "./_core/errors";
