// client/src/pages/admin/Financial.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import AdminPanelStatCard from "@/components/AdminPanelStatCard";
import { hasPermission, useAuth } from "@/_core/hooks/useAuth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  Timestamp,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/_core/firebase";
import {
  AUDIT_ACTIONS,
  auditedUpdateDoc,
  buildAuditSource,
  runAuditedOperation,
} from "@/lib/auditLog";
import { getClientInvestmentStatusMeta } from "@/lib/workflowStatusMeta";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  DollarSign,
  TrendingUp,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { PDFDocument } from "pdf-lib";
import {
  formatCurrencyEN,
  formatDateEN,
  formatNumberEN,
} from "@/lib/formatters";
import {
  buildProjectsMap,
  getProjectDisplayTitle,
  getProjectDisplayTitleById,
} from "@/lib/projectDisplay";
import {
  buildUserIdentityIndex,
  getLinkedUserDisplayName,
  resolveLinkedUser,
} from "@/lib/userDisplay";

/* =========================
   helpers
========================= */
const toDate = (v: any) => (v instanceof Timestamp ? v.toDate() : new Date(v));

const toNumber = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const addMonths = (d: Date, months: number) => {
  const x = new Date(d);
  const wholeMonths = Math.trunc(months);
  const fractionalMonths = months - wholeMonths;
  x.setMonth(x.getMonth() + wholeMonths);
  if (fractionalMonths !== 0) {
    x.setDate(x.getDate() + Math.round(fractionalMonths * 30.4375));
  }
  return x;
};

const diffDays = (a: Date, b: Date) => {
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
};

const monthsBetween = (start: Date, end: Date) => {
  const days = Math.max(0, diffDays(end, start));
  // Average month length to support pro-rata without over/under-bias.
  return days / 30.4375;
};

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ✅ PDF Download helpers
const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const fmtMoney = (n: any) => {
  return formatNumberEN(Number(n || 0));
};

const safeFile = (s: string) => String(s || "file").replace(/[^\w\-]+/g, "_");

const INVESTMENTS_TABLE_CARD_CLASS =
  "overflow-hidden border border-slate-200/80 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.18)]";
const INVESTMENTS_TABLE_HEADER_CLASS =
  "border-b border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5";
const INVESTMENTS_TABLE_TITLE_CLASS =
  "flex items-center gap-2 text-[1.02rem] font-semibold tracking-tight text-slate-950";
const INVESTMENTS_TABLE_SHELL_CLASS =
  "overflow-hidden rounded-[22px] border border-slate-200/80 bg-white";
const INVESTMENTS_TABLE_HEAD_ROW_CLASS =
  "border-b border-slate-200 bg-slate-50/80";
const INVESTMENTS_TABLE_HEAD_CLASS =
  "h-12 px-4 text-right text-[11px] font-semibold tracking-[0.12em] text-slate-500";
const INVESTMENTS_TABLE_ROW_CLASS =
  "border-b border-slate-100 odd:bg-white even:bg-slate-50/[0.55] hover:bg-slate-50/90";
const INVESTMENTS_TABLE_CELL_CLASS =
  "px-4 py-4 text-right align-middle text-sm text-slate-600";
const INVESTMENTS_TABLE_BADGE_BASE_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border px-3.5 text-xs font-semibold leading-none tracking-[0.01em] shadow-none";
const INVESTMENTS_TABLE_OUTLINE_BUTTON_CLASS =
  "h-9 rounded-xl border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-50";
const INVESTMENTS_TABLE_PDF_BUTTON_CLASS =
  "h-9 whitespace-nowrap rounded-xl border-sky-200 bg-sky-50 px-3.5 text-[13px] font-medium text-sky-700 shadow-none hover:bg-sky-100 hover:text-sky-800";
const INVESTMENTS_TABLE_DANGER_BUTTON_CLASS =
  "h-9 rounded-xl border-rose-200 bg-rose-50 px-3.5 text-[13px] font-medium text-rose-700 shadow-none hover:bg-rose-100 hover:text-rose-800";
const INVESTMENTS_TABLE_PASSIVE_ACTION_CLASS =
  "inline-flex h-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-3.5 text-xs font-medium text-slate-600";

const REPORT_PAGE_WIDTH = 595.28;
const REPORT_PAGE_HEIGHT = 841.89;
const REPORT_PAGE_MARGIN = 40;
const REPORT_CANVAS_WIDTH = 1120;
const REPORT_SHEET_MARGIN = 40;
const REPORT_SECTION_PADDING = 22;
const REPORT_SECTION_GAP = 18;
const REPORT_COLUMN_GAP = 16;
const REPORT_ROW_GAP = 14;
const REPORT_FIELD_HORIZONTAL_PADDING = 22;
const REPORT_FIELD_TOP_PADDING = 20;
const REPORT_FIELD_BOTTOM_PADDING = 18;
const REPORT_FIELD_LABEL_LINE_HEIGHT = 18;
const REPORT_FIELD_LABEL_TO_VALUE_GAP = 12;
const REPORT_SECTION_HEADER_HEIGHT = 52;

type InvestmentReportField = {
  label: string;
  value: string;
  span?: 1 | 2;
  tone?: "default" | "accent" | "muted";
  valueSize?: "small" | "default" | "large";
};

type InvestmentReportSection = {
  title: string;
  items: InvestmentReportField[];
  layout?: "half" | "full";
};

type InvestmentReportData = {
  platformName: string;
  title: string;
  projectName: string;
  reportDate: string;
  reportNumber: string;
  amount: string;
  status: string;
  sections: InvestmentReportSection[];
  footer: string;
};

const canvasToPngBytes = async (canvas: HTMLCanvasElement) => {
  const dataUrl = canvas.toDataURL("image/png");
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
};

const splitLongToken = (
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidth: number
) => {
  const parts: string[] = [];
  let current = "";

  for (const char of token) {
    const candidate = current + char;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    parts.push(current);
    current = char;
  }

  if (current) parts.push(current);
  return parts.length ? parts : [token];
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string | CanvasGradient | CanvasPattern,
  stroke?: string | CanvasGradient | CanvasPattern,
  lineWidth = 1
) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
};

const wrapRtlText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const normalized = String(text || "-").replace(/\r/g, "").trim() || "-";
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  for (const paragraphRaw of paragraphs) {
    const paragraph = paragraphRaw.replace(/\s+/g, " ").trim();
    if (!paragraph) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of paragraph.split(" ")) {
      if (ctx.measureText(word).width > maxWidth) {
        if (current) {
          lines.push(current);
          current = "";
        }

        const brokenWord = splitLongToken(ctx, word, maxWidth);
        lines.push(...brokenWord.slice(0, -1));
        current = brokenWord[brokenWord.length - 1] || "";
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      lines.push(current);
      current = word;
    }

    if (current) lines.push(current);
  }

  return lines.length ? lines : ["-"];
};

const getFieldTypography = (field: InvestmentReportField) => {
  const size = field.valueSize || "default";
  const fontMap = {
    small: { font: "500 16px Tahoma, Arial", lineHeight: 24 },
    default: { font: "600 21px Tahoma, Arial", lineHeight: 30 },
    large: { font: "700 26px Tahoma, Arial", lineHeight: 36 },
  } as const;

  const toneMap = {
    default: "#0f172a",
    accent: "#0f4c81",
    muted: "#334155",
  } as const;

  return {
    ...fontMap[size],
    color: toneMap[field.tone || "default"],
  };
};

const buildSectionRows = (items: InvestmentReportField[]) => {
  const rows: InvestmentReportField[][] = [];
  let pending: InvestmentReportField[] = [];

  for (const item of items) {
    if (item.span === 2) {
      if (pending.length) {
        rows.push(pending);
        pending = [];
      }
      rows.push([item]);
      continue;
    }

    pending.push(item);
    if (pending.length === 2) {
      rows.push(pending);
      pending = [];
    }
  }

  if (pending.length) rows.push(pending);
  return rows;
};

const measureFieldHeight = (
  ctx: CanvasRenderingContext2D,
  field: InvestmentReportField,
  width: number
) => {
  const typography = getFieldTypography(field);
  ctx.font = typography.font;
  const lines = wrapRtlText(
    ctx,
    field.value,
    width - REPORT_FIELD_HORIZONTAL_PADDING * 2
  );
  const minHeight = field.valueSize === "small" ? 84 : field.valueSize === "large" ? 110 : 96;
  const contentHeight =
    REPORT_FIELD_TOP_PADDING +
    REPORT_FIELD_LABEL_LINE_HEIGHT +
    REPORT_FIELD_LABEL_TO_VALUE_GAP +
    lines.length * typography.lineHeight +
    REPORT_FIELD_BOTTOM_PADDING;

  return Math.max(minHeight, contentHeight);
};

const measureSectionHeight = (
  ctx: CanvasRenderingContext2D,
  section: InvestmentReportSection,
  sectionWidth: number
) => {
  const innerWidth = sectionWidth - REPORT_SECTION_PADDING * 2;
  const columnWidth = (innerWidth - REPORT_COLUMN_GAP) / 2;
  const rows = buildSectionRows(section.items);

  let height = REPORT_SECTION_PADDING + REPORT_SECTION_HEADER_HEIGHT;
  rows.forEach((row, index) => {
    const rowHeight = Math.max(
      ...row.map(item =>
        measureFieldHeight(
          ctx,
          item,
          row.length === 1 || item.span === 2 ? innerWidth : columnWidth
        )
      )
    );
    height += rowHeight;
    if (index < rows.length - 1) height += REPORT_ROW_GAP;
  });

  return height + REPORT_SECTION_PADDING;
};

const drawFieldCard = (
  ctx: CanvasRenderingContext2D,
  field: InvestmentReportField,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  drawRoundedRect(ctx, x, y, width, height, 18, "#ffffff", "#dbe5f0");

  const insetX = x + width - REPORT_FIELD_HORIZONTAL_PADDING;
  const typography = getFieldTypography(field);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = "600 14px Tahoma, Arial";
  ctx.fillText(field.label, insetX, y + REPORT_FIELD_TOP_PADDING + 2);

  ctx.fillStyle = typography.color;
  ctx.font = typography.font;
  const lines = wrapRtlText(
    ctx,
    field.value,
    width - REPORT_FIELD_HORIZONTAL_PADDING * 2
  );

  let lineY =
    y +
    REPORT_FIELD_TOP_PADDING +
    REPORT_FIELD_LABEL_LINE_HEIGHT +
    REPORT_FIELD_LABEL_TO_VALUE_GAP +
    4;
  for (const line of lines) {
    if (line) ctx.fillText(line, insetX, lineY);
    lineY += typography.lineHeight;
  }
};

const drawSection = (
  ctx: CanvasRenderingContext2D,
  section: InvestmentReportSection,
  x: number,
  y: number,
  width: number
) => {
  const height = measureSectionHeight(ctx, section, width);
  const innerWidth = width - REPORT_SECTION_PADDING * 2;
  const columnWidth = (innerWidth - REPORT_COLUMN_GAP) / 2;
  const rows = buildSectionRows(section.items);

  drawRoundedRect(ctx, x, y, width, height, 24, "#f8fafc", "#e2e8f0");

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 24px Tahoma, Arial";
  ctx.fillText(section.title, x + width - REPORT_SECTION_PADDING, y + 34);

  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(
    x + REPORT_SECTION_PADDING,
    y + REPORT_SECTION_PADDING + 30,
    width - REPORT_SECTION_PADDING * 2,
    1
  );

  let rowY = y + REPORT_SECTION_PADDING + REPORT_SECTION_HEADER_HEIGHT;
  rows.forEach((row, rowIndex) => {
    const rowHeight = Math.max(
      ...row.map(item =>
        measureFieldHeight(
          ctx,
          item,
          row.length === 1 || item.span === 2 ? innerWidth : columnWidth
        )
      )
    );

    if (row.length === 1 || row[0].span === 2) {
      drawFieldCard(
        ctx,
        row[0],
        x + REPORT_SECTION_PADDING,
        rowY,
        innerWidth,
        rowHeight
      );
    } else {
      drawFieldCard(
        ctx,
        row[0],
        x + REPORT_SECTION_PADDING + columnWidth + REPORT_COLUMN_GAP,
        rowY,
        columnWidth,
        rowHeight
      );
      drawFieldCard(
        ctx,
        row[1],
        x + REPORT_SECTION_PADDING,
        rowY,
        columnWidth,
        rowHeight
      );
    }

    rowY += rowHeight;
    if (rowIndex < rows.length - 1) rowY += REPORT_ROW_GAP;
  });

  return height;
};

type PositionedReportSection = {
  section: InvestmentReportSection;
  x: number;
  y: number;
  width: number;
};

const layoutReportSections = (
  ctx: CanvasRenderingContext2D,
  sections: InvestmentReportSection[],
  x: number,
  startY: number,
  width: number
) => {
  const positioned: PositionedReportSection[] = [];
  const halfWidth = (width - REPORT_COLUMN_GAP) / 2;
  let cursorY = startY;
  let pendingHalf: InvestmentReportSection | null = null;

  const flushPendingHalf = () => {
    if (!pendingHalf) return;

    const fullWidthHeight = measureSectionHeight(ctx, pendingHalf, width);
    positioned.push({
      section: pendingHalf,
      x,
      y: cursorY,
      width,
    });
    cursorY += fullWidthHeight + REPORT_SECTION_GAP;
    pendingHalf = null;
  };

  sections.forEach((section, index) => {
    const layoutMode =
      section.layout || (index === sections.length - 1 ? "full" : "half");

    if (layoutMode === "half") {
      if (!pendingHalf) {
        pendingHalf = section;
        return;
      }

      const rightHeight = measureSectionHeight(ctx, pendingHalf, halfWidth);
      const leftHeight = measureSectionHeight(ctx, section, halfWidth);
      positioned.push({
        section: pendingHalf,
        x: x + halfWidth + REPORT_COLUMN_GAP,
        y: cursorY,
        width: halfWidth,
      });
      positioned.push({
        section,
        x,
        y: cursorY,
        width: halfWidth,
      });
      cursorY += Math.max(rightHeight, leftHeight) + REPORT_SECTION_GAP;
      pendingHalf = null;
      return;
    }

    flushPendingHalf();

    const fullWidthHeight = measureSectionHeight(ctx, section, width);
    positioned.push({
      section,
      x,
      y: cursorY,
      width,
    });
    cursorY += fullWidthHeight + REPORT_SECTION_GAP;
  });

  flushPendingHalf();

  return {
    sections: positioned,
    height: positioned.length ? cursorY - startY - REPORT_SECTION_GAP : 0,
  };
};

const renderInvestmentReportCanvas = (report: InvestmentReportData) => {
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = REPORT_CANVAS_WIDTH;
  measureCanvas.height = 10;
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("canvas_not_supported");

  const sheetWidth = REPORT_CANVAS_WIDTH - REPORT_SHEET_MARGIN * 2;
  const headerTextWidth = sheetWidth - 372;
  measureCtx.direction = "rtl";
  measureCtx.textAlign = "right";
  measureCtx.font = "600 24px Tahoma, Arial";
  const projectNameLines = wrapRtlText(
    measureCtx,
    report.projectName,
    headerTextWidth
  );
  const headerHeight = 214 + Math.max(0, projectNameLines.length - 1) * 30;
  const headerWidth = sheetWidth - 52;
  const measuredSectionLayout = layoutReportSections(
    measureCtx,
    report.sections,
    0,
    0,
    headerWidth
  );
  const footerHeight = 72;
  const contentHeight =
    REPORT_SHEET_MARGIN +
    headerHeight +
    REPORT_SECTION_GAP +
    measuredSectionLayout.height +
    footerHeight +
    REPORT_SHEET_MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = REPORT_CANVAS_WIDTH;
  canvas.height = Math.ceil(contentHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_not_supported");

  ctx.fillStyle = "#eef3f9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sheetX = REPORT_SHEET_MARGIN;
  const sheetY = REPORT_SHEET_MARGIN;
  const sheetHeight = canvas.height - REPORT_SHEET_MARGIN * 2;
  drawRoundedRect(ctx, sheetX, sheetY, sheetWidth, sheetHeight, 34, "#ffffff", "#dbe5f0");

  const headerX = sheetX + 26;
  const headerY = sheetY + 26;
  const gradient = ctx.createLinearGradient(
    headerX,
    headerY,
    headerX + headerWidth,
    headerY + headerHeight
  );
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#1d4d8b");
  drawRoundedRect(ctx, headerX, headerY, headerWidth, headerHeight, 28, gradient);

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  const headerRight = headerX + headerWidth - 40;
  const summaryWidth = 264;

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 17px Tahoma, Arial";
  ctx.fillText(report.platformName, headerRight, headerY + 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 36px Tahoma, Arial";
  ctx.fillText(report.title, headerRight, headerY + 84);

  ctx.font = "600 24px Tahoma, Arial";
  let projectLineY = headerY + 118;
  for (const line of projectNameLines) {
    if (line) ctx.fillText(line, headerRight, projectLineY);
    projectLineY += 30;
  }

  const drawHeaderMeta = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number
  ) => {
    drawRoundedRect(ctx, x, y, width, 44, 16, "rgba(255,255,255,0.12)", "rgba(255,255,255,0.18)");
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "600 14px Tahoma, Arial";
    ctx.fillText(label, x + width - 18, y + 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 16px Tahoma, Arial";
    ctx.fillText(value, x + width - 18, y + 36);
  };

  const metaY = headerY + headerHeight - 68;
  drawHeaderMeta(
    "رقم التقرير",
    report.reportNumber,
    headerRight - 250,
    metaY,
    250
  );
  drawHeaderMeta(
    "تاريخ التقرير",
    report.reportDate,
    headerRight - 250 - 16 - 180,
    metaY,
    180
  );

  const summaryX = headerX + 28;
  const summaryY = headerY + 28;
  const summaryHeight = headerHeight - 56;
  const summaryRight = summaryX + summaryWidth - 24;
  drawRoundedRect(
    ctx,
    summaryX,
    summaryY,
    summaryWidth,
    summaryHeight,
    24,
    "rgba(255,255,255,0.14)",
    "rgba(255,255,255,0.2)"
  );

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("ملخص سريع", summaryX + summaryWidth - 24, summaryY + 34);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 15px Tahoma, Arial";
  ctx.fillText("المبلغ المستثمر", summaryX + summaryWidth - 24, summaryY + 72);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Tahoma, Arial";
  const amountLines = wrapRtlText(ctx, report.amount, summaryWidth - 48);
  let amountY = summaryY + 110;
  for (const line of amountLines.slice(0, 2)) {
    if (line) ctx.fillText(line, summaryX + summaryWidth - 24, amountY);
    amountY += 34;
  }

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 15px Tahoma, Arial";
  ctx.fillText("الحالة", summaryX + summaryWidth - 24, summaryY + summaryHeight - 64);
  drawRoundedRect(
    ctx,
    summaryX + 24,
    summaryY + summaryHeight - 50,
    summaryWidth - 48,
    34,
    17,
    "rgba(255,255,255,0.16)",
    "rgba(255,255,255,0.22)"
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText(report.status, summaryX + summaryWidth - 38, summaryY + summaryHeight - 26);

  let sectionY = headerY + headerHeight + REPORT_SECTION_GAP;
  report.sections.forEach(section => {
    const renderedHeight = drawSection(ctx, section, headerX, sectionY, headerWidth);
    sectionY += renderedHeight + REPORT_SECTION_GAP;
  });

  ctx.fillStyle = "#64748b";
  ctx.font = "500 15px Tahoma, Arial";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(report.footer, canvas.width / 2, canvas.height - 34);

  return canvas;
};

const renderInvestmentReportCanvasSinglePage = (
  report: InvestmentReportData
) => {
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = REPORT_CANVAS_WIDTH;
  measureCanvas.height = 10;
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("canvas_not_supported");

  const sheetWidth = REPORT_CANVAS_WIDTH - REPORT_SHEET_MARGIN * 2;
  const headerWidth = sheetWidth - 52;
  const summaryWidth = 264;
  const headerTextWidth = headerWidth - summaryWidth - 96;

  measureCtx.direction = "rtl";
  measureCtx.textAlign = "right";
  measureCtx.font = "600 24px Tahoma, Arial";
  const projectNameLines = wrapRtlText(
    measureCtx,
    report.projectName,
    headerTextWidth
  );
  const headerHeight = 214 + Math.max(0, projectNameLines.length - 1) * 30;
  const measuredSectionLayout = layoutReportSections(
    measureCtx,
    report.sections,
    0,
    0,
    headerWidth
  );

  const footerHeight = 72;
  const contentHeight =
    REPORT_SHEET_MARGIN +
    headerHeight +
    REPORT_SECTION_GAP +
    measuredSectionLayout.height +
    footerHeight +
    REPORT_SHEET_MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = REPORT_CANVAS_WIDTH;
  canvas.height = Math.ceil(contentHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_not_supported");

  ctx.fillStyle = "#eef3f9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sheetX = REPORT_SHEET_MARGIN;
  const sheetY = REPORT_SHEET_MARGIN;
  const sheetHeight = canvas.height - REPORT_SHEET_MARGIN * 2;
  drawRoundedRect(
    ctx,
    sheetX,
    sheetY,
    sheetWidth,
    sheetHeight,
    34,
    "#ffffff",
    "#dbe5f0"
  );

  const headerX = sheetX + 26;
  const headerY = sheetY + 26;
  const gradient = ctx.createLinearGradient(
    headerX,
    headerY,
    headerX + headerWidth,
    headerY + headerHeight
  );
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#1d4d8b");
  drawRoundedRect(ctx, headerX, headerY, headerWidth, headerHeight, 28, gradient);

  ctx.direction = "rtl";
  ctx.textAlign = "right";

  const headerRight = headerX + headerWidth - 40;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 17px Tahoma, Arial";
  ctx.fillText(report.platformName, headerRight, headerY + 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 36px Tahoma, Arial";
  ctx.fillText(report.title, headerRight, headerY + 84);

  ctx.font = "600 24px Tahoma, Arial";
  let projectLineY = headerY + 118;
  for (const line of projectNameLines) {
    if (line) ctx.fillText(line, headerRight, projectLineY);
    projectLineY += 30;
  }

  const drawHeaderMeta = (
    label: string,
    value: string,
    x: number,
    y: number,
    width: number
  ) => {
    drawRoundedRect(
      ctx,
      x,
      y,
      width,
      44,
      16,
      "rgba(255,255,255,0.12)",
      "rgba(255,255,255,0.18)"
    );
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "600 14px Tahoma, Arial";
    ctx.fillText(label, x + width - 18, y + 18);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 16px Tahoma, Arial";
    ctx.fillText(value, x + width - 18, y + 36);
  };

  const metaY = headerY + headerHeight - 68;
  drawHeaderMeta(
    "\u0631\u0642\u0645 \u0627\u0644\u062a\u0642\u0631\u064a\u0631",
    report.reportNumber,
    headerRight - 250,
    metaY,
    250
  );
  drawHeaderMeta(
    "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u0642\u0631\u064a\u0631",
    report.reportDate,
    headerRight - 250 - 16 - 180,
    metaY,
    180
  );

  const summaryX = headerX + 28;
  const summaryY = headerY + 28;
  const summaryHeight = headerHeight - 56;
  const summaryRight = summaryX + summaryWidth - 24;
  drawRoundedRect(
    ctx,
    summaryX,
    summaryY,
    summaryWidth,
    summaryHeight,
    24,
    "rgba(255,255,255,0.14)",
    "rgba(255,255,255,0.2)"
  );

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 17px Tahoma, Arial";
  ctx.fillText(
    "\u0645\u0644\u062e\u0635 \u0633\u0631\u064a\u0639",
    summaryRight,
    summaryY + 32
  );

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 14px Tahoma, Arial";
  ctx.fillText("\u0627\u0644\u062d\u0627\u0644\u0629", summaryRight, summaryY + 54);
  drawRoundedRect(
    ctx,
    summaryX + 24,
    summaryY + 62,
    summaryWidth - 48,
    34,
    17,
    "rgba(255,255,255,0.16)",
    "rgba(255,255,255,0.22)"
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText(report.status, summaryX + summaryWidth - 38, summaryY + 86);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 14px Tahoma, Arial";
  ctx.fillText(
    "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0633\u062a\u062b\u0645\u0631",
    summaryRight,
    summaryY + 122
  );
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 26px Tahoma, Arial";
  const amountLines = wrapRtlText(ctx, report.amount, summaryWidth - 48);
  let amountY = summaryY + 150;
  for (const line of amountLines.slice(0, 2)) {
    if (line) ctx.fillText(line, summaryRight, amountY);
    amountY += 26;
  }

  const sectionLayout = layoutReportSections(
    ctx,
    report.sections,
    headerX,
    headerY + headerHeight + REPORT_SECTION_GAP,
    headerWidth
  );
  sectionLayout.sections.forEach(positionedSection => {
    drawSection(
      ctx,
      positionedSection.section,
      positionedSection.x,
      positionedSection.y,
      positionedSection.width
    );
  });

  ctx.fillStyle = "#64748b";
  ctx.font = "500 15px Tahoma, Arial";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(report.footer, canvas.width / 2, canvas.height - 34);

  return canvas;
};

const appendInvestmentReportToPdf = async (
  pdf: PDFDocument,
  report: InvestmentReportData
) => {
  const canvas = renderInvestmentReportCanvasSinglePage(report);
  const targetWidth = REPORT_PAGE_WIDTH - REPORT_PAGE_MARGIN * 2;
  const targetHeight = REPORT_PAGE_HEIGHT - REPORT_PAGE_MARGIN * 2;
  const pngBytes = await canvasToPngBytes(canvas);
  const png = await pdf.embedPng(pngBytes);
  const scale = Math.min(targetWidth / canvas.width, targetHeight / canvas.height);
  const renderedWidth = canvas.width * scale;
  const renderedHeight = canvas.height * scale;
  const page = pdf.addPage([REPORT_PAGE_WIDTH, REPORT_PAGE_HEIGHT]);

  page.drawImage(png, {
    x: (REPORT_PAGE_WIDTH - renderedWidth) / 2,
    y: REPORT_PAGE_HEIGHT - REPORT_PAGE_MARGIN - renderedHeight,
    width: renderedWidth,
    height: renderedHeight,
  });
};

export default function Financial() {
  const { user } = useAuth();
  const canEditFinancial = hasPermission(user, "financial.edit");
  const [loading, setLoading] = useState(true);

  const [investments, setInvestments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeDate, setCloseDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });

  const [rejectionReason, setRejectionReason] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customDuration, setCustomDuration] = useState("");
  const projectsMap = useMemo(() => buildProjectsMap(projects), [projects]);
  const userIdentityIndex = useMemo(() => buildUserIdentityIndex(users), [users]);

  /* =========================
     Load data
  ========================= */
  const loadAll = async () => {
    try {
      setLoading(true);

      const [invSnap, userSnap, projSnap] = await Promise.all([
        getDocs(collection(db, "investments")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "projects")),
      ]);

      setInvestments(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("فشل تحميل البيانات المالية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "projects"),
      snap => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      error => {
        console.error(error);
        toast.error("تعذر مزامنة أسماء المشاريع الحالية.");
      }
    );

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    const subscribeToCollection = (
      collectionName: "investments" | "users" | "projects",
      setter: (rows: any[]) => void,
      errorMessage: string
    ) => {
      const unsub = onSnapshot(
        collection(db, collectionName),
        (snap) => {
          setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
        (error) => {
          console.error(`${collectionName} snapshot error`, error);
          toast.error(errorMessage);
        }
      );

      unsubs.push(unsub);
    };

    subscribeToCollection(
      "investments",
      setInvestments,
      "تعذر مزامنة الاستثمارات الحالية."
    );
    subscribeToCollection("users", setUsers, "تعذر مزامنة بيانات المستثمرين.");
    subscribeToCollection("projects", setProjects, "تعذر مزامنة أسماء المشاريع الحالية.");

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  /* =========================
     Derived
  ========================= */
  const pendingInvestments = useMemo(
    () => investments.filter(i => i.status === "pending"),
    [investments]
  );

  const approvedInvestments = useMemo(
    () =>
      investments.filter(i =>
        ["active", "completed"].includes(String(i.status || ""))
      ),
    [investments]
  );

  const totalPendingAmount = pendingInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const totalApprovedAmount = approvedInvestments.reduce(
    (s, i) => s + Number(i.amount || 0),
    0
  );

  const getUserName = (uid: string) =>
    users.find(u => u.id === uid)?.name || "غير معروف";

  const getProjectName = (pid: string) =>
    getProjectDisplayTitleById(projectsMap, pid, "غير معروف") || "غير معروف";

  const getInvestorUserRecord = (investment: any) => {
    return resolveLinkedUser(investment, userIdentityIndex);
  };

  const getStatusBadge = (status: string) => {
    const meta = getClientInvestmentStatusMeta(status);
    const normalized = String(status || "")
      .trim()
      .toLowerCase();

    const classMap: Record<string, string> = {
      pending: "border-amber-200 bg-amber-50 text-amber-700",
      approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
      active: "border-sky-200 bg-sky-50 text-sky-700",
      completed: "border-slate-200 bg-slate-100 text-slate-700",
      closed: "border-slate-200 bg-slate-100 text-slate-700",
      rejected: "border-rose-200 bg-rose-50 text-rose-700",
      cancelled: "border-rose-200 bg-rose-50 text-rose-700",
    };

    return (
      <Badge
        className={cn(
          INVESTMENTS_TABLE_BADGE_BASE_CLASS,
          classMap[normalized] || "border-slate-200 bg-slate-100 text-slate-700"
        )}
      >
        {meta.label}
      </Badge>
    );
  };

  const getInvestorDisplayName = (investment: any) => {
    const userRecord = getInvestorUserRecord(investment);

    const emailLocalPart = String(userRecord?.email || "")
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const candidates = [
      investment?.investorName,
      investment?.userSnapshot?.displayName,
      investment?.userSnapshot?.name,
      userRecord?.displayName,
      userRecord?.name,
      userRecord?.fullName,
      userRecord?.profile?.name,
      emailLocalPart,
    ];

    for (const candidate of candidates) {
      const value = String(candidate || "").trim();
      if (value && value !== "undefined" && value !== "null") return value;
    }

    return "غير معروف";
  };

  const getInvestorDisplayNameLive = (investment: any) =>
    getLinkedUserDisplayName(investment, userIdentityIndex, "غير معروف");

  const buildInvestmentReportData = (investment: any): InvestmentReportData => {
    const userRecord = getInvestorUserRecord(investment);
    const projectRecord = projects.find(
      project => project.id === investment.projectId
    );
    const startAt =
      investment.startAt instanceof Timestamp ? investment.startAt.toDate() : null;
    const plannedEndAt =
      investment.plannedEndAt instanceof Timestamp
        ? investment.plannedEndAt.toDate()
        : null;

    const investorName = getInvestorDisplayNameLive(investment);
    const projectName =
      getProjectDisplayTitle(projectRecord, investment?.projectTitle, "غير معروف") ||
      "غير معروف";
    const statusLabel = getClientInvestmentStatusMeta(investment.status).label;
    const reportDate = formatDateEN(new Date(), {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });

    return {
      platformName: "منصة معدن الاستثمارية",
      title: "تقرير الاستثمار",
      projectName,
      reportDate,
      reportNumber: `MAADEN-INV-${investment.id.substring(0, 8).toUpperCase()}`,
      amount: `${fmtMoney(investment.amount)} ر.س`,
      status: statusLabel,
      sections: [
        {
          title: "بيانات المستثمر",
          items: [
            {
              label: "اسم المستثمر",
              value: investorName,
            },
            {
              label: "رقم الجوال",
              value: userRecord?.phone || "-",
            },
            {
              label: "البريد الإلكتروني",
              value: userRecord?.email || "-",
              span: 2,
              valueSize: "small",
            },
          ],
        },
        {
          title: "بيانات المشروع",
          items: [
            {
              label: "اسم المشروع",
              value: projectName,
            },
            {
              label: "القطاع",
              value: projectRecord?.sector || "-",
            },
            {
              label: "وصف المشروع",
              value: projectRecord?.description || "-",
              span: 2,
              valueSize: "small",
              tone: "muted",
            },
          ],
        },
        {
          title: "تفاصيل الاستثمار",
          items: [
            {
              label: "المبلغ المستثمر",
              value: `${fmtMoney(investment.amount)} ر.س`,
              tone: "accent",
              valueSize: "large",
            },
            {
              label: "حالة الاستثمار",
              value: statusLabel,
            },
            {
              label: "تاريخ بدء الاستثمار",
              value: startAt
                ? formatDateEN(startAt, {
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                })
                : "-",
            },
            {
              label: "تاريخ الانتهاء المخطط",
              value: plannedEndAt
                ? formatDateEN(plannedEndAt, {
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                })
                : "-",
            },
          ],
        },
        {
          title: "الأرباح",
          items: [
            {
              label: "الربح المتوقع",
              value:
                investment.expectedProfit == null
                  ? "-"
                  : `${fmtMoney(investment.expectedProfit)} ر.س`,
              tone: "accent",
              valueSize: "large",
            },
            {
              label: "الربح الفعلي",
              value:
                investment.earnedProfit == null
                  ? "-"
                  : `${fmtMoney(investment.earnedProfit)} ر.س`,
              valueSize: "large",
            },
          ],
        },
        {
          title: "ملاحظات",
          items: [
            {
              label: "تنبيه",
              value:
                "هذا التقرير مولد تلقائيًا من البيانات المتاحة وقت التصدير.\nالأرباح المتوقعة تقديرية وقد تختلف عن النتائج الفعلية بحسب أداء المشروع.",
              span: 2,
              valueSize: "small",
              tone: "muted",
            },
          ],
        },
      ],
      footer: "منصة معدن الاستثمارية | www.maaden.sa | info@maaden.sa | الرياض، المملكة العربية السعودية",
    };
  };

  const getActionStateLabel = (status: string) => {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();

    const map: Record<string, string> = {
      pending: "بانتظار الاعتماد",
      pending_review: "بانتظار الاعتماد",
      reviewing: "قيد المراجعة",
      pending_contract: "قيد تجهيز العقد",
      signing: "بانتظار التوقيع",
      signed: "بانتظار الاعتماد النهائي",
      approved: "جاهز للتفعيل",
      completed: "مكتمل",
      closed: "مكتمل",
      rejected: "مرفوض",
      cancelled: "ملغي",
    };

    return map[normalized] || "لا يوجد إجراء الآن";
  };

  /* =========================
     Actions
  ========================= */
  const approveInvestmentTx = async () => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!selectedInvestment) return;
    const generatedContractRef = doc(collection(db, "contracts"));

    try {
      const inv = selectedInvestment;
      const projectId = String(inv.projectId || "").trim();
      const investmentRef = doc(db, "investments", inv.id);
      const contractRef = doc(
        db,
        "contracts",
        String(inv.contractId || generatedContractRef.id)
      );

      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_APPROVED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "approve",
        }),
        relatedIds: {
          investmentId: inv.id,
          projectId: projectId || undefined,
          contractId: contractRef.id,
          userId: String(inv.investorUid || inv.userId || "") || undefined,
        },
        message: `Approved investment ${inv.id} and prepared contract ${contractRef.id}`,
        meta: {
          amount: toNumber(inv.amount, 0),
          projectName: getProjectName(projectId),
        },
        targets: [
          { ref: investmentRef, entityType: "investment" },
          { ref: contractRef, entityType: "contract", label: "contract" },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const invRef = doc(db, "investments", inv.id);
            const invSnap = await tx.get(invRef);
            if (!invSnap.exists()) throw new Error("investment_not_found");

            const invData: any = invSnap.data();

            const curStatus = String(invData.status || "");
            if (curStatus !== "pending") throw new Error("not_pending");

            const projectId = String(invData.projectId || inv.projectId || "");
            if (!projectId) throw new Error("missing_projectId");

            const projRef = doc(db, "projects", projectId);
            const projSnap = await tx.get(projRef);
            if (!projSnap.exists()) throw new Error("project_not_found");

            const proj: any = projSnap.data();
            const amount = toNumber(invData.amount, 0);
            if (amount <= 0) throw new Error("missing_amount");

            const contractId = String(invData.contractId || "").trim();
            const contractRef = contractId
              ? doc(db, "contracts", contractId)
              : generatedContractRef;
            const now = serverTimestamp();
            const invUpdate: any = {
              status: "pending_contract",
              contractStatus: "draft",
              approvedAmount: amount,
              approvedAt: now,
              finalizedAt: null,
              signedAt: null,
              startAt: null,
              plannedEndAt: null,
              annualReturnAtSign: null,
              durationMonthsAtSign: null,
              expectedProfit: null,
              earnedProfit: null,
              withdrawnAt: null,
              actualEndAt: null,
              exitType: null,
              projectTitleAtSign: null,
              termsLockedAt: null,
              legalTermsSnapshot: null,
              contractId: contractRef.id,
              updatedAt: new Date(),
            };
            tx.update(invRef, invUpdate);

            tx.set(
              contractRef,
              {
                investmentId: inv.id,
                projectId,
                projectTitle: String(
                  proj.titleAr || proj.title || invData.projectTitle || ""
                ),
                investorUid: String(
                  invData.investorUid || invData.userId || ""
                ),
                investorName: String(invData.investorName || ""),
                investorEmail: invData.investorEmail || null,
                investorPhone: invData.investorPhone || null,
                amount,
                currency: invData.currency || "SAR",
                status: contractId
                  ? invData.contractStatus || "draft"
                  : "draft",
                signedAt: null,
                termsLockedAt: null,
                legalTermsSnapshot: null,
                legalReference: null,
                ...(contractId ? {} : { createdAt: new Date() }),
                updatedAt: new Date(),
              },
              { merge: true }
            );
          }),
      });

      toast.success("تم اعتماد الطلب مبدئيًا وتجهيز مسار العقد");
      setIsApproveDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل اعتماد الطلب مبدئيًا");
    }
  };

  const closeInvestmentEarlyTx = async () => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!selectedInvestment) return;

    try {
      await runAuditedOperation({
        action: AUDIT_ACTIONS.INVESTMENT_COMPLETED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "close",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId:
            String(
              selectedInvestment.investorUid || selectedInvestment.userId || ""
            ) || undefined,
        },
        message: `Closed investment ${selectedInvestment.id} early`,
        meta: {
          closeDate,
          projectName: getProjectName(
            String(selectedInvestment.projectId || "")
          ),
        },
        targets: [
          {
            ref: doc(db, "investments", selectedInvestment.id),
            entityType: "investment",
          },
        ],
        execute: async () =>
          runTransaction(db, async tx => {
            const invRef = doc(db, "investments", selectedInvestment.id);
            const invSnap = await tx.get(invRef);
            if (!invSnap.exists()) throw new Error("investment_not_found");

            const inv: any = invSnap.data();

            const st = String(inv.status || "").toLowerCase();
            if (st === "completed" || st === "closed") {
              throw new Error("investment_already_closed");
            }
            if (st !== "active") {
              throw new Error("invalid_status_for_close");
            }

            const projectId = String(inv.projectId || "");
            if (!projectId) throw new Error("missing_projectId");

            const projRef = doc(db, "projects", projectId);
            const projSnap = await tx.get(projRef);
            if (!projSnap.exists()) throw new Error("project_not_found");

            const proj: any = projSnap.data();

            const amount =
              toNumber(inv.approvedAmount, 0) || toNumber(inv.amount, 0);
            const startAtValue = inv.startAt || inv.signedAt || inv.createdAt;
            if (!startAtValue) throw new Error("missing_start_date");
            const startDate = toDate(startAtValue);
            const exitDate = closeDate
              ? new Date(`${closeDate}T00:00:00`)
              : new Date();
            if (!Number.isFinite(exitDate.getTime()))
              throw new Error("invalid_close_date");
            if (exitDate.getTime() < startDate.getTime())
              throw new Error("close_before_start");

            const annualReturnAtSign =
              toNumber(inv.annualReturnAtSign, 0) ||
              toNumber(inv.customRate, 0) ||
              toNumber(proj.annualReturn, 0);
            if (annualReturnAtSign <= 0) throw new Error("missing_frozen_rate");

            const actualDurationMonths = monthsBetween(startDate, exitDate);
            const earnedProfit = roundMoney(
              amount * (annualReturnAtSign / 100) * (actualDurationMonths / 12)
            );
            const settlementTotal = roundMoney(amount + earnedProfit);

            const closureAt = Timestamp.fromDate(exitDate);

            tx.update(invRef, {
              status: "completed",
              actualEndAt: closureAt,
              withdrawnAt: closureAt,
              exitType: "early_withdrawal",
              earnedProfit,
              actualDurationMonths,
              settlementTotal,
              settlementPrincipal: amount,
              settlementAnnualReturnPercent: annualReturnAtSign,
              settlementFormula:
                "principal * annualRate * (actualDurationMonths / 12)",
              settlementLockedAt: closureAt,
              settlementLocked: true,
              closureLocked: true,
              updatedAt: new Date(),
            });
          }),
      });

      toast.success("تم إكمال الاستثمار بنجاح");
      setIsCloseDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل إكمال الاستثمار");
    }
  };

  const updateFinancials = async () => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!selectedInvestment) return;
    const status = String(selectedInvestment.status || "").toLowerCase();
    if (status !== "pending") {
      toast.error("لا يمكن تعديل الشروط بعد الاعتماد/الإغلاق.");
      return;
    }

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await auditedUpdateDoc({
        ref: invRef,
        data: {
          customRate: toNumber(customRate) || null,
          customDuration: toNumber(customDuration) || null,
          updatedAt: new Date(),
        },
        action: AUDIT_ACTIONS.INVESTMENT_FINANCIALS_UPDATED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: "update_financials",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId:
            String(
              selectedInvestment.investorUid || selectedInvestment.userId || ""
            ) || undefined,
        },
        message: `Updated financial terms for investment ${selectedInvestment.id}`,
        meta: {
          customRate: toNumber(customRate) || null,
          customDuration: toNumber(customDuration) || null,
        },
      });
      toast.success("تم تحديث البيانات المالية");
      setIsEditDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث البيانات المالية");
    }
  };

  const updateStatus = async (status: string, data: any = {}) => {
    if (!canEditFinancial) {
      toast.error("لا تملك صلاحية تعديل الشؤون المالية.");
      return;
    }
    if (!selectedInvestment) return;
    const currentStatus = String(selectedInvestment.status || "").toLowerCase();
    if (currentStatus === "completed" || currentStatus === "closed") {
      toast.error("لا يمكن تعديل الاستثمار بعد الإغلاق.");
      return;
    }

    try {
      const invRef = doc(db, "investments", selectedInvestment.id);
      await auditedUpdateDoc({
        ref: invRef,
        data: {
          status,
          ...data,
          updatedAt: new Date(),
        },
        action:
          status === "rejected"
            ? AUDIT_ACTIONS.INVESTMENT_REJECTED
            : AUDIT_ACTIONS.INVESTMENT_STATUS_CHANGED,
        category: "investment",
        entityType: "investment",
        source: buildAuditSource({
          area: "admin",
          page: "Financial",
          method: status === "rejected" ? "reject" : "update_status",
        }),
        relatedIds: {
          investmentId: selectedInvestment.id,
          projectId: String(selectedInvestment.projectId || "") || undefined,
          userId:
            String(
              selectedInvestment.investorUid || selectedInvestment.userId || ""
            ) || undefined,
        },
        message: `Updated investment ${selectedInvestment.id} status to ${status}`,
        meta: {
          nextStatus: status,
          rejectionReason: data?.rejectionReason || null,
        },
      });
      toast.success("تم تحديث حالة الاستثمار");
      setIsRejectDialogOpen(false);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error("فشل تحديث حالة الاستثمار");
    }
  };

  // ✅ Improved PDF export for a single investor
  const exportInvestorPDF = async (inv: any) => {
    try {
      const pdf = await PDFDocument.create();
      await appendInvestmentReportToPdf(pdf, buildInvestmentReportData(inv));

      const bytes = await pdf.save();
      downloadBytes(
        bytes,
        `Maaden_Investment_Report_${safeFile(getInvestorDisplayNameLive(inv) || inv.id)}.pdf`
      );
      toast.success("تم تنزيل تقرير الاستثمار بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد تقرير الاستثمار");
    }
  };

  // ✅ Improved PDF export for all investors (single PDF with multiple pages)
  const exportAllInvestorsPDF = async () => {
    try {
      const pdf = await PDFDocument.create();
      const reportDate = formatDateEN(new Date(), {
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });

      for (const inv of investments) {
        await appendInvestmentReportToPdf(pdf, buildInvestmentReportData(inv));
      }

      const bytes = await pdf.save();
      downloadBytes(bytes, `Maaden_All_Investment_Reports_${reportDate}.pdf`);
      toast.success("تم تنزيل تقرير جميع المستثمرين بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد تقرير جميع المستثمرين");
    }
  };

  // ✅ Improved PDF export for all investors (separate PDFs)
  const exportAllInvestorsSeparatePDFs = async () => {
    try {
      for (const inv of investments) {
        const pdf = await PDFDocument.create();
        await appendInvestmentReportToPdf(pdf, buildInvestmentReportData(inv));

        const bytes = await pdf.save();
        downloadBytes(
          bytes,
          `Maaden_Investment_Report_${safeFile(getInvestorDisplayNameLive(inv) || inv.id)}.pdf`
        );
      }
      toast.success("تم تنزيل تقارير المستثمرين الفردية بنجاح");
    } catch (e) {
      console.error(e);
      toast.error("فشل توليد تقارير المستثمرين الفردية");
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">الشؤون المالية</h1>
          <p className="text-muted-foreground text-lg">
            إدارة الاستثمارات والموافقات
          </p>

          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={exportAllInvestorsPDF}>
              تصدير تقرير جميع المستثمرين (ملف واحد)
            </Button>
            <Button variant="outline" onClick={exportAllInvestorsSeparatePDFs}>
              تصدير تقارير جميع المستثمرين (ملفات منفصلة)
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid items-stretch gap-2.5 md:grid-cols-2 lg:gap-3">
          <AdminPanelStatCard
            title="الاستثمارات المعلقة"
            value={pendingInvestments.length}
            description="الطلبات التي ما زالت تنتظر اعتمادًا ماليًا أو قرارًا تشغيليًا قبل الإقفال."
            helper={`إجمالي المبالغ المعلقة: ${formatCurrencyEN(totalPendingAmount)}`}
            icon={<Clock className="h-5 w-5" />}
            accent="amber"
            density="compact"
            className="gap-0 rounded-[22px] py-0 shadow-[0_18px_48px_-36px_rgba(2,6,23,0.9)]"
            contentClassName="min-h-[118px] gap-3 px-4 py-3.5 sm:min-h-[124px] sm:px-5 sm:py-4"
            headerClassName="gap-2.5"
            titleClassName="text-[12px] leading-4 text-white/72 sm:text-[12.5px]"
            descriptionClassName="max-w-[28ch] text-[10.5px] leading-[1rem] text-white/54 sm:text-[11px]"
            iconClassName="h-8 w-8 rounded-[14px] [&_svg]:h-4 [&_svg]:w-4"
            bodyClassName="mt-0.5 space-y-1.5"
            valueClassName="text-[1.5rem] leading-none sm:text-[1.72rem]"
            helperClassName="rounded-[14px] px-3 py-1.5 text-[10.5px] leading-[1rem] text-white/64 sm:text-[11px]"
          />

          <AdminPanelStatCard
            title="الاستثمارات المعتمدة"
            value={approvedInvestments.length}
            description="الاستثمارات التي اجتازت الاعتماد وأصبحت ضمن المسار المالي النشط أو المكتمل."
            helper={`إجمالي المبالغ المعتمدة: ${formatCurrencyEN(totalApprovedAmount)}`}
            icon={<CheckCircle className="h-5 w-5" />}
            accent="emerald"
            density="compact"
            className="gap-0 rounded-[22px] py-0 shadow-[0_18px_48px_-36px_rgba(2,6,23,0.9)]"
            contentClassName="min-h-[118px] gap-3 px-4 py-3.5 sm:min-h-[124px] sm:px-5 sm:py-4"
            headerClassName="gap-2.5"
            titleClassName="text-[12px] leading-4 text-white/72 sm:text-[12.5px]"
            descriptionClassName="max-w-[28ch] text-[10.5px] leading-[1rem] text-white/54 sm:text-[11px]"
            iconClassName="h-8 w-8 rounded-[14px] [&_svg]:h-4 [&_svg]:w-4"
            bodyClassName="mt-0.5 space-y-1.5"
            valueClassName="text-[1.5rem] leading-none sm:text-[1.72rem]"
            helperClassName="rounded-[14px] px-3 py-1.5 text-[10.5px] leading-[1rem] text-white/64 sm:text-[11px]"
          />

          <AdminPanelStatCard
            title="الإجمالي المالي"
            value={investments.length}
            description="الصورة الكاملة لكل السجلات الاستثمارية المرتبطة بالشؤون المالية في النظام."
            helper={`إجمالي المبالغ قيد المتابعة: ${formatCurrencyEN(totalPendingAmount + totalApprovedAmount)}`}
            icon={<DollarSign className="h-5 w-5" />}
            accent="blue"
            density="compact"
            className="gap-0 rounded-[22px] py-0 shadow-[0_18px_48px_-36px_rgba(2,6,23,0.9)] md:col-span-2"
            contentClassName="min-h-[104px] gap-3 px-4 py-3.5 sm:min-h-[110px] sm:px-5 sm:py-4"
            headerClassName="gap-2.5"
            titleClassName="text-[12px] leading-4 text-white/72 sm:text-[12.5px]"
            descriptionClassName="max-w-[56ch] text-[10.5px] leading-[1rem] text-white/54 sm:text-[11px]"
            iconClassName="h-8 w-8 rounded-[14px] [&_svg]:h-4 [&_svg]:w-4"
            bodyClassName="mt-0.5 space-y-1.5"
            valueClassName="text-[1.55rem] leading-none sm:text-[1.8rem]"
            helperClassName="w-fit rounded-[14px] px-3 py-1.5 text-[10.5px] leading-[1rem] text-white/64 sm:text-[11px]"
          />
        </div>

        {/* Pending table */}
        <Card>
          <CardHeader>
            <CardTitle>الاستثمارات المعلقة</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center">جاري التحميل...</div>
            ) : pendingInvestments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستثمر</TableHead>
                    <TableHead>المشروع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvestments.map(inv => (
                    <TableRow
                      key={inv.id}
                      className={INVESTMENTS_TABLE_ROW_CLASS}
                    >
                      <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                        <span className="font-medium text-slate-800">
                          {getInvestorDisplayNameLive(inv)}
                        </span>
                      </TableCell>
                      <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                        <span className="font-semibold text-slate-900">
                          {getProjectName(inv.projectId)}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          INVESTMENTS_TABLE_CELL_CLASS,
                          "text-[15px] font-semibold text-slate-950"
                        )}
                      >
                        {formatCurrencyEN(inv.amount)}
                      </TableCell>
                      <TableCell>
                        {formatDateEN(toDate(inv.createdAt), {
                          year: "numeric",
                          month: "numeric",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!canEditFinancial}
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsApproveDialogOpen(true);
                            }}
                          >
                            اعتماد
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={INVESTMENTS_TABLE_DANGER_BUTTON_CLASS}
                            disabled={!canEditFinancial}
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setIsRejectDialogOpen(true);
                            }}
                          >
                            رفض
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canEditFinancial}
                            onClick={() => {
                              setSelectedInvestment(inv);
                              setCustomRate(inv.customRate || "");
                              setCustomDuration(
                                inv.customDuration?.toString() || ""
                              );
                              setIsEditDialogOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات معلقة</div>
            )}
          </CardContent>
        </Card>

        {/* All */}
        <Card className={INVESTMENTS_TABLE_CARD_CLASS}>
          <CardHeader className={INVESTMENTS_TABLE_HEADER_CLASS}>
            <CardTitle className={INVESTMENTS_TABLE_TITLE_CLASS}>
              <TrendingUp className="w-5 h-5" /> جميع الاستثمارات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {investments.length > 0 ? (
              <div className="px-6 pb-6">
                <div className={INVESTMENTS_TABLE_SHELL_CLASS}>
                  <Table className="min-w-full">
                    <TableHeader className="[&_tr]:border-0">
                      <TableRow className={INVESTMENTS_TABLE_HEAD_ROW_CLASS}>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          المستثمر
                        </TableHead>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          المشروع
                        </TableHead>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          المبلغ
                        </TableHead>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          الحالة
                        </TableHead>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          إجراء
                        </TableHead>
                        <TableHead className={INVESTMENTS_TABLE_HEAD_CLASS}>
                          التقرير
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investments.map(inv => (
                        <TableRow
                          key={inv.id}
                          className={INVESTMENTS_TABLE_ROW_CLASS}
                        >
                          <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                            <span className="font-medium text-slate-800">
                              {getInvestorDisplayNameLive(inv)}
                            </span>
                          </TableCell>
                          <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                            <span className="font-semibold text-slate-900">
                              {getProjectName(inv.projectId)}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              INVESTMENTS_TABLE_CELL_CLASS,
                              "text-[15px] font-semibold text-slate-950"
                            )}
                          >
                            {formatCurrencyEN(inv.amount)}
                          </TableCell>
                          <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                            {getStatusBadge(inv.status)}
                          </TableCell>

                          <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                            {inv.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={
                                  INVESTMENTS_TABLE_DANGER_BUTTON_CLASS
                                }
                                disabled={!canEditFinancial}
                                onClick={() => {
                                  setSelectedInvestment(inv);
                                  setIsCloseDialogOpen(true);
                                }}
                              >
                                مكتمل
                              </Button>
                            ) : (
                              <span
                                className={
                                  INVESTMENTS_TABLE_PASSIVE_ACTION_CLASS
                                }
                              >
                                {getActionStateLabel(inv.status)}
                              </span>
                            )}
                          </TableCell>

                          <TableCell className={INVESTMENTS_TABLE_CELL_CLASS}>
                            <Button
                              size="sm"
                              variant="outline"
                              className={INVESTMENTS_TABLE_PDF_BUTTON_CLASS}
                              onClick={() => exportInvestorPDF(inv)}
                              title="تنزيل تقرير الاستثمار المولد من البيانات الحالية"
                            >
                              <FileText className="h-4 w-4" />
                              تصدير تقرير
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">لا توجد استثمارات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Approve */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>اعتماد الاستثمار</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApproveDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button disabled={!canEditFinancial} onClick={approveInvestmentTx}>
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الاستثمار</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="سبب الرفض"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRejectDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason || !canEditFinancial}
              onClick={() => updateStatus("rejected", { rejectionReason })}
            >
              رفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل البيانات المالية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>نسبة مخصصة (%)</Label>
              <Input
                value={customRate}
                onChange={e => setCustomRate(e.target.value)}
              />
            </div>
            <div>
              <Label>مدة مخصصة (شهر)</Label>
              <Input
                value={customDuration}
                onChange={e => setCustomDuration(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button disabled={!canEditFinancial} onClick={updateFinancials}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Investment */}
      <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إكمال الاستثمار</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              سيتم احتساب الربح النسبي حسب المدة من تاريخ الاعتماد إلى تاريخ
              الإكمال.
            </div>

            <div className="space-y-2">
              <Label>تاريخ الإكمال</Label>
              <Input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCloseDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!canEditFinancial}
              onClick={closeInvestmentEarlyTx}
            >
              إكمال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
