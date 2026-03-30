import { PDFDocument } from "pdf-lib";

import {
  formatCurrencyEN,
  formatDateEN,
  formatDateTimeEN,
  formatNumberEN,
  formatPercentEN,
} from "@/lib/formatters";

const FALLBACK_TEXT = "غير متوفر";
const LOGO_SRC = "/logo.png";

const PDF_PAGE_WIDTH = 595.28;
const PDF_PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 64;
const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = Math.round(
  (PDF_PAGE_HEIGHT / PDF_PAGE_WIDTH) * CANVAS_WIDTH
);
const TABLE_ROWS_PER_PAGE = 10;

const BRAND = {
  ink: "#0f172a",
  inkSoft: "#334155",
  paper: "#f7f8fa",
  line: "#d7dde6",
  muted: "#64748b",
  gold: "#f2ae30",
  sky: "#2563eb",
  emerald: "#059669",
} as const;

export type ClientProfilePdfStage = {
  label: string;
  count: number;
  amount: number;
  color: string;
};

export type ClientProfilePdfInvestment = {
  referenceLabel: string;
  projectTitle: string;
  statusLabel: string;
  summaryLabel: string;
  contractStatusLabel: string;
  amount: number;
  expectedProfitTotal: number | null;
  currentProfit: number | null;
  totalValue: number | null;
  progressPercent: number | null;
  requestDate: Date | null;
  maturityDate: Date | null;
  hasAnyDocuments: boolean;
};

export type ClientProfilePdfData = {
  fileNameBase: string;
  reportDate: Date;
  reportNumber: string;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string;
    accountStatus: string;
    roleLabel: string;
    vipLabel: string;
    createdAt: Date | null;
    latestAggregatesUpdate: Date | null;
    internalNotes: string;
  };
  summary: {
    totalInvested: number;
    expectedProfitTotal: number;
    profitToDate: number;
    investmentCount: number;
    activeInvestmentsCount: number;
    inProgressCount: number;
    completedInvestmentsCount: number;
    cancelledInvestmentsCount: number;
    activeProjectsCount: number;
    completedProjectsCount: number;
    documentedInvestmentsCount: number;
    originalContractCount: number;
    signedContractCount: number;
    firstInvestmentDate: Date | null;
    lastInvestmentDate: Date | null;
  };
  stages: ClientProfilePdfStage[];
  investments: ClientProfilePdfInvestment[];
};

type TableColumn = {
  label: string;
  width: number;
  x: number;
  right: number;
};

const safeText = (value: string | null | undefined) => {
  const text = String(value ?? "").trim();
  return text && text !== "undefined" && text !== "null" ? text : FALLBACK_TEXT;
};

const safeFile = (value: string) =>
  String(value || "file").replace(/[^\w\-]+/g, "_");

const downloadBytes = (bytes: Uint8Array, filename: string) => {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const canvasToPngBytes = async (canvas: HTMLCanvasElement) => {
  const dataUrl = canvas.toDataURL("image/png");
  const response = await fetch(dataUrl);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

const waitForFonts = async () => {
  try {
    if ("fonts" in document && "ready" in document.fonts) {
      await document.fonts.ready;
    }
  } catch {
    // Best effort only.
  }
};

const loadImage = async (src: string) => {
  const image = new Image();
  image.decoding = "async";
  image.src = src;

  if (typeof image.decode === "function") {
    try {
      await image.decode();
      return image;
    } catch {
      // Fall back to event-based loading.
    }
  }

  return new Promise<HTMLImageElement | null>((resolve) => {
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
  });
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

const wrapRtlText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const normalized = String(text || FALLBACK_TEXT)
    .replace(/\r/g, "")
    .trim() || FALLBACK_TEXT;
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

        const parts = splitLongToken(ctx, word, maxWidth);
        lines.push(...parts.slice(0, -1));
        current = parts[parts.length - 1] || "";
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

  return lines.length ? lines : [FALLBACK_TEXT];
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

const fillTextRight = (
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  options?: {
    maxWidth?: number;
    lineHeight?: number;
    maxLines?: number;
    color?: string;
    font?: string;
  }
) => {
  const previousFont = ctx.font;
  const previousFill = ctx.fillStyle;

  if (options?.font) ctx.font = options.font;
  if (options?.color) ctx.fillStyle = options.color;

  const lines = wrapRtlText(
    ctx,
    text,
    options?.maxWidth ?? CANVAS_WIDTH - PAGE_MARGIN * 2
  );
  const limited = options?.maxLines ? lines.slice(0, options.maxLines) : lines;
  const lineHeight = options?.lineHeight ?? 30;

  limited.forEach((line, index) => {
    ctx.fillText(line, right, y + index * lineHeight);
  });

  ctx.font = previousFont;
  ctx.fillStyle = previousFill;
  return y + limited.length * lineHeight;
};

const formatMoney = (value: number | null | undefined, digits = 0) =>
  value == null || !Number.isFinite(value)
    ? FALLBACK_TEXT
    : formatCurrencyEN(value, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });

const formatCount = (value: number) => formatNumberEN(Number(value || 0));

const formatDate = (value: Date | null) =>
  value ? formatDateEN(value) : FALLBACK_TEXT;

const formatDateTime = (value: Date | null) =>
  value ? formatDateTimeEN(value) : FALLBACK_TEXT;

const formatProgress = (value: number | null) =>
  value == null || !Number.isFinite(value)
    ? FALLBACK_TEXT
    : formatPercentEN(value, {
        minimumFractionDigits: value > 0 && value < 100 ? 1 : 0,
        maximumFractionDigits: value > 0 && value < 100 ? 1 : 0,
      });

const drawPageBackground = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const headerGlow = ctx.createRadialGradient(
    CANVAS_WIDTH * 0.84,
    150,
    0,
    CANVAS_WIDTH * 0.84,
    150,
    420
  );
  headerGlow.addColorStop(0, "rgba(242,174,48,0.16)");
  headerGlow.addColorStop(1, "rgba(242,174,48,0)");
  ctx.fillStyle = headerGlow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cornerGlow = ctx.createRadialGradient(
    80,
    CANVAS_HEIGHT - 120,
    0,
    80,
    CANVAS_HEIGHT - 120,
    360
  );
  cornerGlow.addColorStop(0, "rgba(37,99,235,0.10)");
  cornerGlow.addColorStop(1, "rgba(37,99,235,0)");
  ctx.fillStyle = cornerGlow;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "rgba(148,163,184,0.08)";
  ctx.lineWidth = 1;
  for (let y = 0; y < CANVAS_HEIGHT; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
};

const drawFooter = (
  ctx: CanvasRenderingContext2D,
  pageNumber: number,
  pageCount: number
) => {
  const footerY = CANVAS_HEIGHT - 54;

  ctx.strokeStyle = "rgba(148,163,184,0.24)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAGE_MARGIN, footerY - 28);
  ctx.lineTo(CANVAS_WIDTH - PAGE_MARGIN, footerY - 28);
  ctx.stroke();

  ctx.fillStyle = BRAND.muted;
  ctx.font = "500 18px Tahoma, Arial";
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillText(
    "منصة معدن الاستثمارية | www.maaden.sa | info@maaden.sa | الرياض، المملكة العربية السعودية",
    CANVAS_WIDTH / 2,
    footerY
  );

  ctx.textAlign = "left";
  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText(`${pageNumber}/${pageCount}`, PAGE_MARGIN, footerY);

  ctx.textAlign = "right";
};

const drawLogo = (
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement | null,
  x: number,
  y: number,
  size: number
) => {
  drawRoundedRect(ctx, x, y, size, size, 24, "#ffffff", "rgba(255,255,255,0.2)");
  if (logo) {
    ctx.drawImage(logo, x + 10, y + 10, size - 20, size - 20);
    return;
  }

  ctx.fillStyle = BRAND.gold;
  ctx.font = "700 38px Tahoma, Arial";
  ctx.textAlign = "center";
  ctx.fillText("م", x + size / 2, y + size / 2 + 14);
  ctx.textAlign = "right";
};

const drawChip = (
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  options?: {
    fill?: string;
    border?: string;
    color?: string;
  }
) => {
  ctx.font = "600 18px Tahoma, Arial";
  const textWidth = ctx.measureText(text).width;
  const width = textWidth + 34;
  const x = right - width;

  drawRoundedRect(
    ctx,
    x,
    y,
    width,
    34,
    17,
    options?.fill || "rgba(255,255,255,0.10)",
    options?.border || "rgba(255,255,255,0.18)"
  );

  ctx.fillStyle = options?.color || "#ffffff";
  ctx.fillText(text, right - 18, y + 23);

  return x - 10;
};

const drawMetricCard = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  metric: {
    kicker: string;
    label: string;
    value: string;
    accent: string;
  }
) => {
  drawRoundedRect(ctx, x, y, width, height, 28, "#ffffff", BRAND.line);

  const accent = ctx.createLinearGradient(x, y, x + width, y + height);
  accent.addColorStop(0, metric.accent);
  accent.addColorStop(1, "rgba(15,23,42,0.96)");
  drawRoundedRect(ctx, x + 18, y + 18, width - 36, 8, 4, accent);

  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 17px Tahoma, Arial";
  ctx.fillText(metric.kicker, x + width - 24, y + 58);

  ctx.fillStyle = BRAND.ink;
  ctx.font = "600 22px Tahoma, Arial";
  fillTextRight(ctx, metric.label, x + width - 24, y + 92, {
    maxWidth: width - 48,
    lineHeight: 28,
    maxLines: 2,
  });

  ctx.fillStyle = BRAND.ink;
  ctx.font = "700 34px Tahoma, Arial";
  fillTextRight(ctx, metric.value, x + width - 24, y + height - 34, {
    maxWidth: width - 48,
    lineHeight: 38,
    maxLines: 2,
  });
};

const drawDetailBlock = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  options?: {
    height?: number;
    accent?: string;
  }
) => {
  const height = options?.height ?? 106;
  drawRoundedRect(ctx, x, y, width, height, 20, "#f8fafc", "#e2e8f0");

  if (options?.accent) {
    ctx.fillStyle = options.accent;
    ctx.fillRect(x + width - 4, y + 14, 4, height - 28);
  }

  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText(label, x + width - 20, y + 30);

  ctx.fillStyle = BRAND.ink;
  ctx.font = "600 22px Tahoma, Arial";
  fillTextRight(ctx, value, x + width - 20, y + 64, {
    maxWidth: width - 40,
    lineHeight: 26,
    maxLines: 2,
  });
};

const buildExecutiveSummary = (data: ClientProfilePdfData) => {
  const projectCoverage =
    data.summary.activeProjectsCount + data.summary.completedProjectsCount;

  const lines = [
    `المحفظة تضم ${formatCount(data.summary.investmentCount)} استثماراً موزعة على ${formatCount(projectCoverage)} مشروعاً، بإجمالي استثمار ${formatMoney(data.summary.totalInvested)} وقيمة عائد متوقع تبلغ ${formatMoney(data.summary.expectedProfitTotal)}.`,
    data.summary.inProgressCount > 0
      ? `هناك ${formatCount(data.summary.inProgressCount)} طلباً أو استثماراً تحت المتابعة حالياً، بينما اكتمل ${formatCount(data.summary.completedInvestmentsCount)} استثماراً حتى تاريخ إعداد التقرير.`
      : "لا توجد طلبات عالقة حالياً، ما يشير إلى دورة متابعة أكثر استقراراً واستجابة تشغيلية أسرع.",
    data.summary.documentedInvestmentsCount > 0
      ? `التغطية التوثيقية تشمل ${formatCount(data.summary.documentedInvestmentsCount)} استثماراً، منها ${formatCount(data.summary.signedContractCount)} عقود موقعة و${formatCount(data.summary.originalContractCount)} عقود أصلية محفوظة في الملف.`
      : "لا توجد ملفات عقود مرفقة حالياً ضمن السجلات المرتبطة بهذا العميل، ما يستدعي مراجعة مسار التوثيق عند الحاجة.",
  ];

  const notes = safeText(data.client.internalNotes);
  if (notes !== FALLBACK_TEXT) {
    lines.push(`ملاحظات داخلية: ${notes}`);
  }

  return lines;
};

const buildTableColumns = (tableX: number, tableWidth: number): TableColumn[] => {
  const layout = [
    { label: "الاستثمار", width: 0.32 },
    { label: "الحالة", width: 0.16 },
    { label: "المبلغ", width: 0.14 },
    { label: "العائد المتوقع", width: 0.14 },
    { label: "التقدم", width: 0.10 },
    { label: "الاستحقاق", width: 0.14 },
  ];

  const columns: TableColumn[] = [];
  let cursorRight = tableX + tableWidth;

  layout.forEach((column, index) => {
    const rawWidth = tableWidth * column.width;
    const width =
      index === layout.length - 1
        ? cursorRight - tableX
        : Math.round(rawWidth);
    const x = cursorRight - width;

    columns.push({
      label: column.label,
      width,
      x,
      right: cursorRight,
    });

    cursorRight = x;
  });

  return columns;
};

const drawOverviewPage = (
  data: ClientProfilePdfData,
  logo: HTMLImageElement | null,
  pageNumber: number,
  pageCount: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to initialize PDF canvas.");
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  drawPageBackground(ctx);

  const sheetX = PAGE_MARGIN;
  const sheetY = PAGE_MARGIN;
  const sheetWidth = CANVAS_WIDTH - PAGE_MARGIN * 2;
  const headerHeight = 316;

  drawRoundedRect(ctx, sheetX, sheetY, sheetWidth, headerHeight, 34, "#ffffff", "#dbe5f0");

  const headerGradient = ctx.createLinearGradient(
    sheetX,
    sheetY,
    sheetX + sheetWidth,
    sheetY + headerHeight
  );
  headerGradient.addColorStop(0, "#0f172a");
  headerGradient.addColorStop(0.55, "#14263f");
  headerGradient.addColorStop(1, "#1e293b");
  drawRoundedRect(
    ctx,
    sheetX + 18,
    sheetY + 18,
    sheetWidth - 36,
    headerHeight - 36,
    30,
    headerGradient
  );

  ctx.fillStyle = "rgba(242,174,48,0.16)";
  ctx.beginPath();
  ctx.ellipse(sheetX + 180, sheetY + 120, 170, 110, 0, 0, Math.PI * 2);
  ctx.fill();

  const headerRight = sheetX + sheetWidth - 48;
  drawLogo(ctx, logo, headerRight - 92, sheetY + 46, 92);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("MAADEN | CORPORATE DOSSIER", headerRight - 112, sheetY + 64);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px Tahoma, Arial";
  ctx.fillText("معدن", headerRight - 112, sheetY + 100);

  ctx.font = "700 46px Tahoma, Arial";
  ctx.fillText("Corporate Investment Report", headerRight, sheetY + 170);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 24px Tahoma, Arial";
  ctx.fillText("تقرير استثماري مؤسسي لملف العميل", headerRight, sheetY + 214);

  let chipCursor = headerRight;
  chipCursor = drawChip(ctx, `تاريخ الإصدار: ${formatDateTime(data.reportDate)}`, chipCursor, sheetY + 242);
  chipCursor = drawChip(
    ctx,
    `الحالة: ${safeText(data.client.accountStatus)}`,
    chipCursor,
    sheetY + 242
  );
  drawChip(
    ctx,
    `عدد الاستثمارات: ${formatCount(data.summary.investmentCount)}`,
    chipCursor,
    sheetY + 242
  );

  const highlightX = sheetX + 42;
  const highlightY = sheetY + 52;
  const highlightWidth = 324;
  const highlightHeight = 212;
  drawRoundedRect(
    ctx,
    highlightX,
    highlightY,
    highlightWidth,
    highlightHeight,
    28,
    "rgba(255,255,255,0.10)",
    "rgba(255,255,255,0.18)"
  );

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("Prepared For", highlightX + highlightWidth - 28, highlightY + 34);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 36px Tahoma, Arial";
  fillTextRight(ctx, data.client.name, highlightX + highlightWidth - 28, highlightY + 86, {
    maxWidth: highlightWidth - 56,
    lineHeight: 40,
    maxLines: 2,
  });

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 17px Tahoma, Arial";
  ctx.fillText(`Client ID: ${safeText(data.client.id)}`, highlightX + highlightWidth - 28, highlightY + 146);
  ctx.fillText(`Report No: ${data.reportNumber}`, highlightX + highlightWidth - 28, highlightY + 176);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 26px Tahoma, Arial";
  ctx.fillText(
    formatMoney(data.summary.totalInvested + data.summary.expectedProfitTotal),
    highlightX + highlightWidth - 28,
    highlightY + 208
  );

  const metricsTop = sheetY + headerHeight + 26;
  const metricsGap = 18;
  const metricsWidth = (sheetWidth - metricsGap * 3) / 4;
  const metricsHeight = 156;

  const metrics = [
    {
      kicker: "PORTFOLIO",
      label: "إجمالي الاستثمار",
      value: formatMoney(data.summary.totalInvested),
      accent: BRAND.gold,
    },
    {
      kicker: "EXPECTED RETURN",
      label: "العائد المتوقع",
      value: formatMoney(data.summary.expectedProfitTotal),
      accent: BRAND.sky,
    },
    {
      kicker: "LIVE PROFIT",
      label: "الربح حتى اليوم",
      value: formatMoney(data.summary.profitToDate, 2),
      accent: BRAND.emerald,
    },
    {
      kicker: "INVESTMENTS",
      label: "عدد الاستثمارات",
      value: formatCount(data.summary.investmentCount),
      accent: BRAND.ink,
    },
  ];

  metrics.forEach((metric, index) => {
    drawMetricCard(
      ctx,
      sheetX + index * (metricsWidth + metricsGap),
      metricsTop,
      metricsWidth,
      metricsHeight,
      metric
    );
  });

  const contentTop = metricsTop + metricsHeight + 26;
  const leftWidth = 668;
  const rightWidth = sheetWidth - leftWidth - 22;
  const cardHeight = 474;

  drawRoundedRect(ctx, sheetX, contentTop, leftWidth, cardHeight, 30, "#ffffff", "#dbe5f0");
  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("CLIENT OVERVIEW", sheetX + leftWidth - 28, contentTop + 38);
  ctx.fillStyle = BRAND.ink;
  ctx.font = "700 30px Tahoma, Arial";
  ctx.fillText("بطاقة العميل والبيانات التشغيلية", sheetX + leftWidth - 28, contentTop + 80);

  const detailY = contentTop + 112;
  const detailGap = 14;
  const detailWidth = (leftWidth - detailGap) / 2;

  drawDetailBlock(
    ctx,
    sheetX,
    detailY,
    leftWidth,
    "البريد الإلكتروني",
    data.client.email,
    { height: 96, accent: BRAND.sky }
  );
  drawDetailBlock(
    ctx,
    sheetX,
    detailY + 110,
    detailWidth,
    "اسم العميل",
    data.client.name,
    { accent: BRAND.gold }
  );
  drawDetailBlock(
    ctx,
    sheetX + detailWidth + detailGap,
    detailY + 110,
    detailWidth,
    "رقم الجوال",
    data.client.phone,
    { accent: BRAND.emerald }
  );
  drawDetailBlock(
    ctx,
    sheetX,
    detailY + 230,
    detailWidth,
    "حالة الحساب",
    data.client.accountStatus,
    { accent: BRAND.sky }
  );
  drawDetailBlock(
    ctx,
    sheetX + detailWidth + detailGap,
    detailY + 230,
    detailWidth,
    "الدور ونوع العميل",
    `${safeText(data.client.roleLabel)} | ${safeText(data.client.vipLabel)}`,
    { accent: BRAND.gold }
  );
  drawDetailBlock(
    ctx,
    sheetX,
    detailY + 350,
    detailWidth,
    "تاريخ التسجيل",
    formatDate(data.client.createdAt)
  );
  drawDetailBlock(
    ctx,
    sheetX + detailWidth + detailGap,
    detailY + 350,
    detailWidth,
    "آخر تحديث للتجميعات",
    formatDateTime(data.client.latestAggregatesUpdate)
  );

  const activityX = sheetX + leftWidth + 22;
  drawRoundedRect(
    ctx,
    activityX,
    contentTop,
    rightWidth,
    cardHeight,
    30,
    "#ffffff",
    "#dbe5f0"
  );

  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("PORTFOLIO ACTIVITY", activityX + rightWidth - 28, contentTop + 38);
  ctx.fillStyle = BRAND.ink;
  ctx.font = "700 30px Tahoma, Arial";
  ctx.fillText("توزيع المحفظة ومستوى التوثيق", activityX + rightWidth - 28, contentTop + 80);

  const barX = activityX + 28;
  const barY = contentTop + 124;
  const barWidth = rightWidth - 56;
  const maxStageAmount = Math.max(
    1,
    ...data.stages.map(stage => Number(stage.amount || 0))
  );

  data.stages.forEach((stage, index) => {
    const y = barY + index * 58;
    const ratio = Math.max(0, Math.min(1, stage.amount / maxStageAmount));

    ctx.fillStyle = BRAND.inkSoft;
    ctx.font = "600 18px Tahoma, Arial";
    ctx.fillText(stage.label, activityX + rightWidth - 28, y + 18);

    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 16px Tahoma, Arial";
    ctx.fillText(
      `${formatCount(stage.count)} | ${formatMoney(stage.amount)}`,
      activityX + rightWidth - 28,
      y + 42
    );

    drawRoundedRect(
      ctx,
      barX,
      y + 20,
      barWidth,
      12,
      6,
      "#eef2f7",
      "#e2e8f0"
    );

    if (ratio > 0) {
      const gradient = ctx.createLinearGradient(barX, y, barX + barWidth, y);
      gradient.addColorStop(0, stage.color);
      gradient.addColorStop(1, `${stage.color}CC`);
      drawRoundedRect(ctx, barX, y + 20, barWidth * ratio, 12, 6, gradient);
    }
  });

  const miniCardY = contentTop + 432 - 80;
  drawRoundedRect(
    ctx,
    activityX + 22,
    miniCardY,
    rightWidth - 44,
    94,
    24,
    "#0f172a",
    "#1e293b"
  );

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText("Document Coverage", activityX + rightWidth - 50, miniCardY + 28);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 22px Tahoma, Arial";
  ctx.fillText(
    `${formatCount(data.summary.documentedInvestmentsCount)} استثمار موثق`,
    activityX + rightWidth - 50,
    miniCardY + 58
  );

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText(
    `${formatCount(data.summary.originalContractCount)} أصلية | ${formatCount(data.summary.signedContractCount)} موقعة`,
    activityX + rightWidth - 50,
    miniCardY + 82
  );

  const notesY = contentTop + cardHeight + 24;
  const notesHeight = 320;
  drawRoundedRect(ctx, sheetX, notesY, sheetWidth, notesHeight, 30, "#ffffff", "#dbe5f0");

  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("EXECUTIVE NOTES", sheetX + sheetWidth - 28, notesY + 38);
  ctx.fillStyle = BRAND.ink;
  ctx.font = "700 30px Tahoma, Arial";
  ctx.fillText("ملخص تنفيذي ومؤشرات زمنية", sheetX + sheetWidth - 28, notesY + 80);

  const summaryLines = buildExecutiveSummary(data);
  const bulletRight = sheetX + sheetWidth - 42;
  summaryLines.slice(0, 3).forEach((line, index) => {
    const bulletY = notesY + 126 + index * 56;
    ctx.fillStyle = BRAND.gold;
    ctx.beginPath();
    ctx.arc(bulletRight - 6, bulletY - 8, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = BRAND.inkSoft;
    ctx.font = "500 20px Tahoma, Arial";
    fillTextRight(ctx, line, bulletRight - 26, bulletY, {
      maxWidth: sheetWidth * 0.58,
      lineHeight: 26,
      maxLines: 2,
    });
  });

  const timelineX = sheetX + 36;
  const timelineWidth = 338;
  const timelineItems = [
    ["أول استثمار", formatDate(data.summary.firstInvestmentDate)],
    ["آخر استثمار", formatDate(data.summary.lastInvestmentDate)],
    ["الاستثمارات النشطة", formatCount(data.summary.activeInvestmentsCount)],
    ["الطلبات تحت المتابعة", formatCount(data.summary.inProgressCount)],
  ];

  timelineItems.forEach((item, index) => {
    drawDetailBlock(
      ctx,
      timelineX,
      notesY + 116 + index * 48,
      timelineWidth,
      item[0],
      item[1],
      {
        height: 42,
        accent: index < 2 ? BRAND.sky : BRAND.gold,
      }
    );
  });

  drawFooter(ctx, pageNumber, pageCount);

  return canvas;
};

const drawTablePage = (
  data: ClientProfilePdfData,
  logo: HTMLImageElement | null,
  rows: ClientProfilePdfInvestment[],
  pageNumber: number,
  pageCount: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to initialize PDF canvas.");
  }

  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  drawPageBackground(ctx);

  const headerX = PAGE_MARGIN;
  const headerY = PAGE_MARGIN;
  const headerWidth = CANVAS_WIDTH - PAGE_MARGIN * 2;
  const headerHeight = 200;

  drawRoundedRect(ctx, headerX, headerY, headerWidth, headerHeight, 32, "#ffffff", "#dbe5f0");

  const gradient = ctx.createLinearGradient(
    headerX,
    headerY,
    headerX + headerWidth,
    headerY + headerHeight
  );
  gradient.addColorStop(0, "#0f172a");
  gradient.addColorStop(1, "#1e293b");
  drawRoundedRect(
    ctx,
    headerX + 16,
    headerY + 16,
    headerWidth - 32,
    headerHeight - 32,
    28,
    gradient
  );

  const headerRight = headerX + headerWidth - 42;
  drawLogo(ctx, logo, headerRight - 78, headerY + 42, 78);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("INVESTMENT SCHEDULE", headerRight - 100, headerY + 62);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 38px Tahoma, Arial";
  ctx.fillText("سجل الاستثمارات المرتبطة", headerRight, headerY + 116);

  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = "600 20px Tahoma, Arial";
  ctx.fillText(
    `${safeText(data.client.name)} | ${formatCount(data.summary.investmentCount)} استثمار`,
    headerRight,
    headerY + 154
  );

  const totalShellX = headerX + 36;
  const totalShellY = headerY + 48;
  const totalShellWidth = 318;
  drawRoundedRect(
    ctx,
    totalShellX,
    totalShellY,
    totalShellWidth,
    104,
    24,
    "rgba(255,255,255,0.10)",
    "rgba(255,255,255,0.18)"
  );

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText("القيمة التقديرية للمحفظة", totalShellX + totalShellWidth - 22, totalShellY + 30);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 28px Tahoma, Arial";
  ctx.fillText(
    formatMoney(data.summary.totalInvested + data.summary.expectedProfitTotal),
    totalShellX + totalShellWidth - 22,
    totalShellY + 72
  );
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 16px Tahoma, Arial";
  ctx.fillText(`رقم التقرير: ${data.reportNumber}`, totalShellX + totalShellWidth - 22, totalShellY + 96);

  const tableShellX = PAGE_MARGIN;
  const tableShellY = headerY + headerHeight + 26;
  const tableShellWidth = CANVAS_WIDTH - PAGE_MARGIN * 2;
  const tableShellHeight = CANVAS_HEIGHT - tableShellY - 108;
  drawRoundedRect(
    ctx,
    tableShellX,
    tableShellY,
    tableShellWidth,
    tableShellHeight,
    30,
    "#ffffff",
    "#dbe5f0"
  );

  ctx.fillStyle = BRAND.muted;
  ctx.font = "600 18px Tahoma, Arial";
  ctx.fillText("Detailed Investment Register", tableShellX + tableShellWidth - 28, tableShellY + 38);

  const tableX = tableShellX + 24;
  const tableY = tableShellY + 72;
  const tableWidth = tableShellWidth - 48;
  const tableHeaderHeight = 54;
  const rowHeight = 112;

  drawRoundedRect(ctx, tableX, tableY, tableWidth, tableHeaderHeight, 18, "#f8fafc", "#e2e8f0");

  const columns = buildTableColumns(tableX, tableWidth);

  ctx.fillStyle = BRAND.inkSoft;
  ctx.font = "600 18px Tahoma, Arial";
  columns.forEach(column => {
    ctx.fillText(column.label, column.right - 18, tableY + 34);
  });

  rows.forEach((row, rowIndex) => {
    const y = tableY + tableHeaderHeight + rowIndex * rowHeight + 8;
    const fill = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
    drawRoundedRect(ctx, tableX, y, tableWidth, rowHeight - 10, 18, fill, "#edf2f7");

    columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) {
        ctx.strokeStyle = "rgba(226,232,240,0.75)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(column.right, y + 14);
        ctx.lineTo(column.right, y + rowHeight - 24);
        ctx.stroke();
      }
    });

    const rightPadding = 18;
    const top = y + 28;

    const projectColumn = columns[0];
    ctx.fillStyle = BRAND.ink;
    ctx.font = "600 20px Tahoma, Arial";
    fillTextRight(ctx, row.projectTitle, projectColumn.right - rightPadding, top, {
      maxWidth: projectColumn.width - 28,
      lineHeight: 24,
      maxLines: 2,
    });

    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 16px Tahoma, Arial";
    const projectMeta = row.hasAnyDocuments
      ? `${row.referenceLabel} | ملفات متاحة`
      : row.referenceLabel;
    fillTextRight(ctx, projectMeta, projectColumn.right - rightPadding, y + 84, {
      maxWidth: projectColumn.width - 28,
      lineHeight: 20,
      maxLines: 1,
    });

    const statusColumn = columns[1];
    ctx.fillStyle = BRAND.inkSoft;
    ctx.font = "600 18px Tahoma, Arial";
    fillTextRight(ctx, row.statusLabel, statusColumn.right - rightPadding, top, {
      maxWidth: statusColumn.width - 28,
      lineHeight: 22,
      maxLines: 2,
    });
    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 15px Tahoma, Arial";
    fillTextRight(
      ctx,
      `${row.summaryLabel} | ${row.contractStatusLabel}`,
      statusColumn.right - rightPadding,
      y + 82,
      {
        maxWidth: statusColumn.width - 28,
        lineHeight: 18,
        maxLines: 2,
      }
    );

    const amountColumn = columns[2];
    ctx.fillStyle = BRAND.ink;
    ctx.font = "700 20px Tahoma, Arial";
    fillTextRight(ctx, formatMoney(row.amount), amountColumn.right - rightPadding, top, {
      maxWidth: amountColumn.width - 28,
      lineHeight: 24,
      maxLines: 2,
    });
    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 15px Tahoma, Arial";
    fillTextRight(ctx, "رأس المال", amountColumn.right - rightPadding, y + 82, {
      maxWidth: amountColumn.width - 28,
      lineHeight: 18,
      maxLines: 1,
    });

    const returnColumn = columns[3];
    ctx.fillStyle = BRAND.sky;
    ctx.font = "700 20px Tahoma, Arial";
    fillTextRight(
      ctx,
      formatMoney(row.expectedProfitTotal),
      returnColumn.right - rightPadding,
      top,
      {
        maxWidth: returnColumn.width - 28,
        lineHeight: 24,
        maxLines: 2,
      }
    );
    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 15px Tahoma, Arial";
    const returnMeta =
      row.currentProfit != null
        ? `ربح حالي: ${formatMoney(row.currentProfit, 2)}`
        : `قيمة إجمالية: ${formatMoney(row.totalValue)}`;
    fillTextRight(ctx, returnMeta, returnColumn.right - rightPadding, y + 82, {
      maxWidth: returnColumn.width - 28,
      lineHeight: 18,
      maxLines: 2,
    });

    const progressColumn = columns[4];
    ctx.fillStyle = BRAND.ink;
    ctx.font = "700 18px Tahoma, Arial";
    fillTextRight(
      ctx,
      formatProgress(row.progressPercent),
      progressColumn.right - rightPadding,
      top,
      {
        maxWidth: progressColumn.width - 28,
        lineHeight: 22,
        maxLines: 1,
      }
    );

    drawRoundedRect(
      ctx,
      progressColumn.x + 18,
      y + 74,
      progressColumn.width - 36,
      10,
      5,
      "#e2e8f0",
      "#dbe5f0"
    );
    const progressRatio =
      row.progressPercent == null
        ? 0
        : Math.max(0, Math.min(1, row.progressPercent / 100));
    if (progressRatio > 0) {
      const progressGradient = ctx.createLinearGradient(
        progressColumn.x,
        y,
        progressColumn.x + progressColumn.width,
        y
      );
      progressGradient.addColorStop(0, BRAND.gold);
      progressGradient.addColorStop(1, BRAND.sky);
      drawRoundedRect(
        ctx,
        progressColumn.x + 18,
        y + 74,
        (progressColumn.width - 36) * progressRatio,
        10,
        5,
        progressGradient
      );
    }

    const maturityColumn = columns[5];
    ctx.fillStyle = BRAND.inkSoft;
    ctx.font = "600 18px Tahoma, Arial";
    fillTextRight(
      ctx,
      formatDate(row.maturityDate),
      maturityColumn.right - rightPadding,
      top,
      {
        maxWidth: maturityColumn.width - 28,
        lineHeight: 22,
        maxLines: 2,
      }
    );
    ctx.fillStyle = BRAND.muted;
    ctx.font = "500 15px Tahoma, Arial";
    fillTextRight(
      ctx,
      `طلب: ${formatDate(row.requestDate)}`,
      maturityColumn.right - rightPadding,
      y + 82,
      {
        maxWidth: maturityColumn.width - 28,
        lineHeight: 18,
        maxLines: 2,
      }
    );
  });

  drawFooter(ctx, pageNumber, pageCount);

  return canvas;
};

const buildPages = async (data: ClientProfilePdfData) => {
  await waitForFonts();
  const logo = await loadImage(LOGO_SRC);

  const tablePageCount =
    data.investments.length > 0
      ? Math.ceil(data.investments.length / TABLE_ROWS_PER_PAGE)
      : 0;
  const pageCount = 1 + tablePageCount;

  const pages = [drawOverviewPage(data, logo, 1, pageCount)];

  for (let index = 0; index < tablePageCount; index += 1) {
    const start = index * TABLE_ROWS_PER_PAGE;
    const end = start + TABLE_ROWS_PER_PAGE;
    pages.push(
      drawTablePage(
        data,
        logo,
        data.investments.slice(start, end),
        index + 2,
        pageCount
      )
    );
  }

  return pages;
};

export const downloadCorporateClientProfilePdf = async (
  data: ClientProfilePdfData
) => {
  const pdf = await PDFDocument.create();
  const pages = await buildPages(data);

  for (const canvas of pages) {
    const pngBytes = await canvasToPngBytes(canvas);
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: PDF_PAGE_WIDTH,
      height: PDF_PAGE_HEIGHT,
    });
  }

  const bytes = await pdf.save();
  const filename = `Maaden_Corporate_Investment_Report_${safeFile(data.fileNameBase)}.pdf`;
  downloadBytes(bytes, filename);
  return filename;
};
