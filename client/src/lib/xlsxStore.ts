import { buildStoredZip, type ZipEntryInput } from "@/lib/zipStore";

export type XlsxCellValue = string | number | boolean | null | undefined;

export type XlsxColumn = {
  key: string;
  header: string;
  width?: number;
  align?: "right" | "center";
};

export type XlsxRow = Record<string, XlsxCellValue>;

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxRow[];
  freezeHeader?: boolean;
  rightToLeft?: boolean;
  title?: string;
  subtitle?: string;
  headerTone?: "navy" | "teal" | "amber" | "emerald" | "slate";
  tabColor?: string;
  zoomScale?: number;
  mergeRanges?: string[];
};

export type XlsxWorkbookImage = {
  data: string | Uint8Array | ArrayBuffer | Blob;
};

export type XlsxWorkbookInput = {
  title: string;
  creator?: string;
  description?: string;
  backgroundImage?: XlsxWorkbookImage | null;
  sheets: XlsxSheet[];
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeXmlText(value: string) {
  return value.replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, "");
}

function normalizeText(value: unknown) {
  return sanitizeXmlText(String(value ?? ""));
}

function needsPreserveSpace(value: string) {
  return /(^\s|\s$)|[\r\n\t]/.test(value);
}

function toExcelColumnName(index: number) {
  let current = index + 1;
  let columnName = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName || "A";
}

function sanitizeSheetName(value: string, index: number) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[:\\/?*\[\]]/g, " ")
    .replace(/\s+/g, " ");

  const fallback = cleaned || `Sheet ${index + 1}`;
  return fallback.slice(0, 31) || `Sheet ${index + 1}`;
}

function uniqueSheetNames(sheets: XlsxSheet[]) {
  const seen = new Set<string>();

  return sheets.map((sheet, index) => {
    const baseName = sanitizeSheetName(sheet.name, index);
    let nextName = baseName;
    let suffix = 2;

    while (seen.has(nextName)) {
      const prefix = baseName.slice(0, Math.max(0, 31 - String(suffix).length - 1)).trim() || "Sheet";
      nextName = `${prefix} ${suffix}`.slice(0, 31);
      suffix += 1;
    }

    seen.add(nextName);
    return {
      ...sheet,
      name: nextName,
    };
  });
}

function displayLength(value: XlsxCellValue) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return value ? 3 : 2;
  return String(value).length;
}

function buildColsXml(columns: XlsxColumn[], rows: XlsxRow[]) {
  const cols = columns.map((column, index) => {
    const autoWidth = rows.reduce(
      (maxWidth, row) => Math.max(maxWidth, displayLength(row[column.key])),
      column.header.length
    );
    const width = Math.min(Math.max(autoWidth + 5, column.width ?? 12), 64);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  });

  return `<cols>${cols.join("")}</cols>`;
}

function buildInlineStringCell(ref: string, text: string, styleId: number) {
  const normalized = normalizeText(text);
  const preserve = needsPreserveSpace(normalized) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t${preserve}>${escapeXml(
    normalized
  )}</t></is></c>`;
}

function buildCellXml(ref: string, value: XlsxCellValue, styleId: number) {
  if (value === null || value === undefined || value === "") {
    return buildInlineStringCell(ref, "", styleId);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return buildInlineStringCell(ref, value ? "Yes" : "No", styleId);
  }

  return buildInlineStringCell(ref, String(value), styleId);
}

function normalizeRgb(value: string | undefined, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `FF${normalized}` : fallback;
}

function getHeaderStyleId(tone: XlsxSheet["headerTone"]) {
  switch (tone) {
    case "teal":
      return 3;
    case "amber":
      return 4;
    case "emerald":
      return 5;
    case "slate":
      return 6;
    case "navy":
    default:
      return 1;
  }
}

function getRowStyleId(row: XlsxRow, rowIndex: number) {
  const style = String(row.__style || "").trim();
  if (style === "total") return 9;
  if (style === "net") return 10;
  if (style === "deduction") return 11;
  return rowIndex % 2 === 1 ? 2 : 0;
}

function getCellStyleId(row: XlsxRow, rowIndex: number, column: XlsxColumn) {
  const rowStyleId = getRowStyleId(row, rowIndex);
  if (column.align !== "center") return rowStyleId;
  if (rowStyleId === 0) return 12;
  if (rowStyleId === 2) return 13;
  return rowStyleId;
}

function buildSheetXml(sheet: XlsxSheet, hasBackgroundImage = false) {
  if (!sheet.columns.length) {
    throw new Error(`Worksheet "${sheet.name}" must include at least one column.`);
  }

  const lastColumn = toExcelColumnName(sheet.columns.length - 1);
  const hasTitle = Boolean(sheet.title || sheet.subtitle);
  const headerRowNumber = hasTitle ? 4 : 1;
  const firstDataRowNumber = headerRowNumber + 1;
  const lastRowNumber = Math.max(sheet.rows.length + headerRowNumber, headerRowNumber);
  const dimension = `A1:${lastColumn}${lastRowNumber}`;
  const headerStyleId = getHeaderStyleId(sheet.headerTone);

  const headerCells = sheet.columns.map((column, index) =>
    buildCellXml(`${toExcelColumnName(index)}${headerRowNumber}`, column.header, headerStyleId)
  );

  const dataRows = sheet.rows.map((row, rowIndex) => {
    const cells = sheet.columns.map((column, columnIndex) =>
      buildCellXml(
        `${toExcelColumnName(columnIndex)}${rowIndex + firstDataRowNumber}`,
        row[column.key],
        getCellStyleId(row, rowIndex, column)
      )
    );

    return `<row r="${rowIndex + firstDataRowNumber}" ht="28" customHeight="1">${cells.join("")}</row>`;
  });

  const zoomScale = Math.min(
    Math.max(Math.round(Number(sheet.zoomScale || 120)), 80),
    140
  );
  const sheetViewAttributes = `workbookViewId="0" zoomScale="${zoomScale}" zoomScaleNormal="${zoomScale}"${
    sheet.rightToLeft ? ' rightToLeft="1"' : ""
  }`;
  const freezeHeader =
    sheet.freezeHeader !== false
      ? `<sheetViews><sheetView ${sheetViewAttributes}><pane ySplit="${headerRowNumber}" topLeftCell="A${firstDataRowNumber}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${firstDataRowNumber}" sqref="A${firstDataRowNumber}"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView ${sheetViewAttributes}/></sheetViews>`;
  const titleRows = hasTitle
    ? [
        `<row r="1" ht="36" customHeight="1">${buildCellXml("A1", sheet.title || sheet.name, 7)}</row>`,
        `<row r="2" ht="28" customHeight="1">${buildCellXml("A2", sheet.subtitle || "", 8)}</row>`,
        '<row r="3" ht="22" customHeight="1"/>',
      ].join("")
    : "";
  const mergeRanges = [
    ...(hasTitle ? [`A1:${lastColumn}1`, `A2:${lastColumn}2`] : []),
    ...(sheet.mergeRanges || []),
  ];
  const sheetPr = sheet.tabColor
    ? `<sheetPr><tabColor rgb="${normalizeRgb(sheet.tabColor, "FF030640")}"/></sheetPr>`
    : "";

  return [
    XML_HEADER,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${
      hasBackgroundImage
        ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        : ""
    }>`,
    sheetPr,
    `<dimension ref="${dimension}"/>`,
    freezeHeader,
    '<sheetFormatPr defaultRowHeight="26"/>',
    buildColsXml(sheet.columns, sheet.rows),
    "<sheetData>",
    titleRows,
    `<row r="${headerRowNumber}" ht="30" customHeight="1">${headerCells.join("")}</row>`,
    dataRows.join(""),
    "</sheetData>",
    `<autoFilter ref="A${headerRowNumber}:${lastColumn}${lastRowNumber}"/>`,
    mergeRanges.length
      ? `<mergeCells count="${mergeRanges.length}">${mergeRanges
          .map(range => `<mergeCell ref="${escapeXml(range)}"/>`)
          .join("")}</mergeCells>`
      : "",
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>',
    hasBackgroundImage ? '<picture r:id="rId1"/>' : "",
    "</worksheet>",
  ].join("");
}

function buildWorkbookXml(sheets: XlsxSheet[]) {
  const sheetEntries = sheets.map(
    (sheet, index) =>
      `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  );

  return [
    XML_HEADER,
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<bookViews><workbookView activeTab="0"/></bookViews>',
    `<sheets>${sheetEntries.join("")}</sheets>`,
    "</workbook>",
  ].join("");
}

function buildWorkbookRelsXml(sheets: XlsxSheet[]) {
  const sheetRelationships = sheets.map(
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
        index + 1
      }.xml"/>`
  );
  const styleRelationshipId = sheets.length + 1;

  return [
    XML_HEADER,
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    sheetRelationships.join(""),
    `<Relationship Id="rId${styleRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    "</Relationships>",
  ].join("");
}

function buildSheetRelsXml(backgroundImageFileName: string) {
  return [
    XML_HEADER,
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${escapeXml(
      backgroundImageFileName
    )}"/>`,
    "</Relationships>",
  ].join("");
}

function buildContentTypesXml(sheets: XlsxSheet[], hasBackgroundImage = false) {
  const sheetOverrides = sheets.map(
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${
        index + 1
      }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  );

  return [
    XML_HEADER,
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    hasBackgroundImage
      ? '<Default Extension="png" ContentType="image/png"/>'
      : "",
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    sheetOverrides.join(""),
    "</Types>",
  ].join("");
}

function buildRootRelsXml() {
  return [
    XML_HEADER,
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
    "</Relationships>",
  ].join("");
}

function buildStylesXml() {
  return [
    XML_HEADER,
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    "<fonts count=\"5\">",
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><color rgb="FFFFFFFF"/><sz val="12"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Calibri"/><family val="2"/></font>',
    '<font><color rgb="FF475569"/><sz val="12"/><name val="Calibri"/><family val="2"/></font>',
    "</fonts>",
    "<fills count=\"12\">",
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF030640"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFB45309"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF047857"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF7ED"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF2F2"/><bgColor indexed="64"/></patternFill></fill>',
    "</fills>",
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="14">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>',
    '<xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="1" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="1" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="1" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyAlignment="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>',
    "</cellXfs>",
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    "</styleSheet>",
  ].join("");
}

function buildCorePropsXml(title: string, creator: string, description: string) {
  const now = new Date().toISOString();

  return [
    XML_HEADER,
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    `<dc:title>${escapeXml(normalizeText(title))}</dc:title>`,
    `<dc:creator>${escapeXml(normalizeText(creator))}</dc:creator>`,
    `<dc:description>${escapeXml(normalizeText(description))}</dc:description>`,
    `<cp:lastModifiedBy>${escapeXml(normalizeText(creator))}</cp:lastModifiedBy>`,
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`,
    "</cp:coreProperties>",
  ].join("");
}

function buildAppPropsXml(title: string, sheets: XlsxSheet[]) {
  const partNames = sheets.map(
    (sheet) => `<vt:lpstr>${escapeXml(normalizeText(sheet.name))}</vt:lpstr>`
  );
  const headingPairs =
    '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>' +
    String(sheets.length) +
    "</vt:i4></vt:variant></vt:vector></HeadingPairs>";

  return [
    XML_HEADER,
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<Application>Codex</Application>',
    headingPairs,
    `<TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${partNames.join(
      ""
    )}</vt:vector></TitlesOfParts>`,
    `<Company>${escapeXml(normalizeText(title))}</Company>`,
    "<LinksUpToDate>false</LinksUpToDate>",
    "<SharedDoc>false</SharedDoc>",
    "<HyperlinksChanged>false</HyperlinksChanged>",
    "<AppVersion>1.0</AppVersion>",
    "</Properties>",
  ].join("");
}

export async function buildWorkbookXlsx(input: XlsxWorkbookInput) {
  const workbookTitle = String(input.title || "Workbook").trim() || "Workbook";
  const creator = String(input.creator || "MAEDIN").trim() || "MAEDIN";
  const description =
    String(input.description || "Generated workbook export").trim() ||
    "Generated workbook export";
  const sheets = uniqueSheetNames(input.sheets || []);
  const hasBackgroundImage = Boolean(input.backgroundImage?.data);
  const backgroundImageFileName = "background22.png";

  if (!sheets.length) {
    throw new Error("Workbook must include at least one worksheet.");
  }

  const entries: ZipEntryInput[] = [
    {
      path: "[Content_Types].xml",
      data: buildContentTypesXml(sheets, hasBackgroundImage),
    },
    {
      path: "_rels/.rels",
      data: buildRootRelsXml(),
    },
    {
      path: "docProps/core.xml",
      data: buildCorePropsXml(workbookTitle, creator, description),
    },
    {
      path: "docProps/app.xml",
      data: buildAppPropsXml(workbookTitle, sheets),
    },
    {
      path: "xl/workbook.xml",
      data: buildWorkbookXml(sheets),
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      data: buildWorkbookRelsXml(sheets),
    },
    {
      path: "xl/styles.xml",
      data: buildStylesXml(),
    },
  ];

  sheets.forEach((sheet, index) => {
    entries.push({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      data: buildSheetXml(sheet, hasBackgroundImage),
    });

    if (hasBackgroundImage) {
      entries.push({
        path: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
        data: buildSheetRelsXml(backgroundImageFileName),
      });
    }
  });

  if (input.backgroundImage?.data) {
    entries.push({
      path: `xl/media/${backgroundImageFileName}`,
      data: input.backgroundImage.data,
    });
  }

  const zipBlob = await buildStoredZip(entries);
  return new Blob([await zipBlob.arrayBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
