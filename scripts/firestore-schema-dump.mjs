// scripts/firestore-schema-dump.mjs
import admin from "firebase-admin";
import fs from "node:fs";

const DEPTH = 3;           // عمق قراءة subcollections
const SAMPLE_DOCS = 3;     // كم وثيقة نأخذ عينة من كل collection
const MAX_FIELDS = 80;     // حد أقصى للحقول بالعرض

// ✅ لازم تحط GOOGLE_APPLICATION_CREDENTIALS لمسار serviceAccountKey.json
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
}

function typeOfValue(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof admin.firestore.Timestamp) return "timestamp";
  if (v instanceof Date) return "date";
  if (isPlainObject(v)) return "object";
  return typeof v; // string, number, boolean
}

function mergeFieldTypes(target, data) {
  const keys = Object.keys(data || {});
  for (const k of keys) {
    if (Object.keys(target).length >= MAX_FIELDS) break;

    const v = data[k];
    const t = typeOfValue(v);

    if (!target[k]) {
      target[k] = { types: new Set([t]) };
    } else {
      target[k].types.add(t);
    }

    // لو object نكمل داخله بشكل خفيف
    if (isPlainObject(v)) {
      target[k].children ??= {};
      mergeFieldTypes(target[k].children, v);
    }

    // لو array وفيه objects، خذ عينة من أول عنصر
    if (Array.isArray(v) && v.length && isPlainObject(v[0])) {
      target[k].children ??= {};
      mergeFieldTypes(target[k].children, v[0]);
    }
  }
}

function serializeFields(node) {
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = {
      types: Array.from(v.types || []),
      ...(v.children ? { children: serializeFields(v.children) } : {}),
    };
  }
  return out;
}

async function listSubcollections(docRef) {
  try {
    const cols = await docRef.listCollections();
    return cols.map((c) => c.id);
  } catch {
    return [];
  }
}

async function scanCollection(colRef, depth) {
  const snap = await colRef.limit(SAMPLE_DOCS).get();
  const fields = {};
  const sampleDocIds = [];

  for (const d of snap.docs) {
    sampleDocIds.push(d.id);
    mergeFieldTypes(fields, d.data());
  }

  const info = {
    path: colRef.path,
    sampleDocIds,
    fields: serializeFields(fields),
    subcollections: {},
  };

  if (depth <= 0) return info;

  // نجمع أسماء subcollections من عينات الوثائق
  const subNames = new Set();
  for (const d of snap.docs) {
    const subs = await listSubcollections(d.ref);
    subs.forEach((s) => subNames.add(s));
  }

  for (const sub of subNames) {
    // scan subcollection under each sample doc (نأخذ أول doc فقط كتمثيل)
    const firstDoc = snap.docs[0];
    if (!firstDoc) continue;
    info.subcollections[sub] = await scanCollection(firstDoc.ref.collection(sub), depth - 1);
  }

  return info;
}

async function main() {
  const root = { generatedAt: new Date().toISOString(), collections: {} };

  // ✅ هذا يسحب كل الـ root collections
  const collections = await db.listCollections();

  for (const c of collections) {
    console.log("Scanning:", c.id);
    root.collections[c.id] = await scanCollection(c, DEPTH);
  }

  fs.mkdirSync("schema_dump", { recursive: true });
  fs.writeFileSync("schema_dump/firestore_schema.json", JSON.stringify(root, null, 2), "utf8");

  console.log("✅ Done -> schema_dump/firestore_schema.json");
}

main().catch((e) => {
  console.error("❌ Failed:", e);
  process.exit(1);
});
