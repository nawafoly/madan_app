const textEncoder = new TextEncoder();
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;

export type ZipEntryInput = {
  path: string;
  data: string | Uint8Array | ArrayBuffer | Blob;
  lastModified?: Date | string | number | null;
};

type PreparedZipEntry = {
  path: string;
  pathBytes: Uint8Array;
  data: Uint8Array;
  crc32: number;
  dosTime: number;
  dosDate: number;
};

let crc32Table: Uint32Array | null = null;

function getCrc32Table() {
  if (crc32Table) return crc32Table;

  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  crc32Table = table;
  return table;
}

function computeCrc32(bytes: Uint8Array) {
  const table = getCrc32Table();
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeZipPath(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");

  if (!normalized) {
    throw new Error("ZIP entry path is required.");
  }

  return normalized;
}

function normalizeZipDate(value?: Date | string | number | null) {
  const parsed =
    value instanceof Date
      ? value
      : value === null || value === undefined || value === ""
        ? new Date()
        : new Date(value);

  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function toDosDateTime(value?: Date | string | number | null) {
  const date = normalizeZipDate(value);
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
}

async function normalizeEntryBytes(data: ZipEntryInput["data"]) {
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error("Unsupported ZIP entry data type.");
}

async function prepareEntry(entry: ZipEntryInput): Promise<PreparedZipEntry> {
  const path = normalizeZipPath(entry.path);
  const data = await normalizeEntryBytes(entry.data);
  const pathBytes = textEncoder.encode(path);
  const { dosTime, dosDate } = toDosDateTime(entry.lastModified);

  return {
    path,
    pathBytes,
    data,
    crc32: computeCrc32(data),
    dosTime,
    dosDate,
  };
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function buildLocalHeader(entry: PreparedZipEntry) {
  const header = new Uint8Array(30 + entry.pathBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, UTF8_FLAG);
  writeUint16(view, 8, STORE_METHOD);
  writeUint16(view, 10, entry.dosTime);
  writeUint16(view, 12, entry.dosDate);
  writeUint32(view, 14, entry.crc32);
  writeUint32(view, 18, entry.data.length);
  writeUint32(view, 22, entry.data.length);
  writeUint16(view, 26, entry.pathBytes.length);
  writeUint16(view, 28, 0);
  header.set(entry.pathBytes, 30);

  return header;
}

function buildCentralHeader(entry: PreparedZipEntry, localHeaderOffset: number) {
  const header = new Uint8Array(46 + entry.pathBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, UTF8_FLAG);
  writeUint16(view, 10, STORE_METHOD);
  writeUint16(view, 12, entry.dosTime);
  writeUint16(view, 14, entry.dosDate);
  writeUint32(view, 16, entry.crc32);
  writeUint32(view, 20, entry.data.length);
  writeUint32(view, 24, entry.data.length);
  writeUint16(view, 28, entry.pathBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localHeaderOffset);
  header.set(entry.pathBytes, 46);

  return header;
}

function buildEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, offset: number) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, offset);
  writeUint16(view, 20, 0);

  return record;
}

function toBlobBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function buildStoredZip(entries: ZipEntryInput[]) {
  const preparedEntries = await Promise.all(entries.map((entry) => prepareEntry(entry)));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  let localOffset = 0;

  for (const entry of preparedEntries) {
    const localHeaderOffset = localOffset;
    const localHeader = buildLocalHeader(entry);
    const centralHeader = buildCentralHeader(entry, localHeaderOffset);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);

    localOffset += localHeader.length + entry.data.length;
  }

  const centralDirectoryOffset = localOffset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = buildEndOfCentralDirectory(
    preparedEntries.length,
    centralDirectorySize,
    centralDirectoryOffset
  );

  const blobParts = [...localParts, ...centralParts, eocd].map((part) => toBlobBuffer(part));

  return new Blob(blobParts, {
    type: "application/zip",
  });
}
