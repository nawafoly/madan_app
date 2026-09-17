import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(anchor, replacement);
}

// ---------------------------------------------------------------------------
// 1) Canonical v3 records read surface.
// ---------------------------------------------------------------------------
const v3Path = "workers/habat-attendance-v3.js";
let v3 = read(v3Path);

const routerAnchor = [
  '  if (subpath === "/monthly-summary") {',
  '    if (request.method !== "GET") return methodNotAllowed(["GET"]);',
  '    return getSavedMonthlySummary(db, url, principal);',
  '  }',
  '',
  '  if (!principal.canManage) return forbidden("habat_management_forbidden");',
].join("\n");

const routerReplacement = [
  '  if (subpath === "/monthly-summary") {',
  '    if (request.method !== "GET") return methodNotAllowed(["GET"]);',
  '    return getSavedMonthlySummary(db, url, principal);',
  '  }',
  '',
  '  if (subpath === "/records") {',
  '    if (request.method !== "GET") return methodNotAllowed(["GET"]);',
  '    return listAttendanceRecords(db, url, principal);',
  '  }',
  '',
  '  if (!principal.canManage) return forbidden("habat_management_forbidden");',
].join("\n");

v3 = replaceOnce(v3, routerAnchor, routerReplacement, "v3 records read route");

const createManualAnchor = 'async function createManualRecord(db, request, requester) {';
const listFunction = [
  'async function listAttendanceRecords(db, url, principal) {',
  '  const today = getRiyadhDateKey();',
  '  const to = normalizeDate(url.searchParams.get("to")) || today;',
  '  const from = normalizeDate(url.searchParams.get("from")) || `${to.slice(0, 7)}-01`;',
  '  if (from > to) return json(400, { ok: false, message: "habat_invalid_date_range" });',
  '',
  '  const requestedAccessId = normalizeText(url.searchParams.get("accessId"));',
  '  if (!principal.canManage && requestedAccessId && requestedAccessId !== principal.accessId) {',
  '    return forbidden("habat_management_forbidden");',
  '  }',
  '  const scopedAccessId = principal.canManage ? requestedAccessId : principal.accessId;',
  '  const status = normalizeText(url.searchParams.get("status")).toLowerCase();',
  '  const parsedLimit = Number(url.searchParams.get("limit"));',
  '  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(500, Math.floor(parsedLimit))) : 200;',
  '',
  '  const filters = ["attendance_date >= ?", "attendance_date <= ?"];',
  '  const bindings = [from, to];',
  '  if (scopedAccessId) {',
  '    const accessResult = await getAccessById(db, scopedAccessId);',
  '    if (!accessResult.ok) return accessResult.response;',
  '    filters.push("(access_id = ? OR ((access_id IS NULL OR trim(access_id) = \'\') AND lower(account_email) = lower(?)))");',
  '    bindings.push(scopedAccessId, normalizeText(accessResult.row.email).toLowerCase());',
  '  }',
  '  if (status) {',
  '    filters.push("attendance_status = ?");',
  '    bindings.push(status);',
  '  }',
  '',
  '  try {',
  '    const result = await db.prepare(',
  '      `SELECT * FROM habat_attendance_records',
  '       WHERE ${filters.join(" AND ")}',
  '       ORDER BY attendance_date DESC, COALESCE(check_in_at, check_out_at) DESC, id DESC',
  '       LIMIT ?`',
  '    ).bind(...bindings, limit).all();',
  '    return json(200, {',
  '      ok: true,',
  '      from,',
  '      to,',
  '      accessId: scopedAccessId || null,',
  '      limit,',
  '      records: (result?.results || []).map(mapRecord),',
  '    });',
  '  } catch (error) {',
  '    console.error("[habat-v3] records list failed", error);',
  '    return json(500, { ok: false, message: "habat_records_query_failed" });',
  '  }',
  '}',
  '',
].join("\n");

v3 = replaceOnce(v3, createManualAnchor, listFunction + createManualAnchor, "canonical v3 records list function");
write(v3Path, v3);

// ---------------------------------------------------------------------------
// 2) Manager records page reads through v3 and filters by canonical access id.
// ---------------------------------------------------------------------------
const appPath = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
let app = read(appPath);

app = replaceOnce(
  app,
  '  const [employeeEmail, setEmployeeEmail] = useState("all");',
  '  const [employeeAccessId, setEmployeeAccessId] = useState("all");',
  "manager records access-id state"
);

app = replaceOnce(
  app,
  '    if (employeeEmail !== "all") params.set("email", employeeEmail);',
  '    if (employeeAccessId !== "all") params.set("accessId", employeeAccessId);',
  "manager records access-id filter"
);

app = replaceOnce(
  app,
  '        habatApi<{ ok: true; records: HabatRecord[] }>(`v2/records?${params.toString()}`),',
  '        habatApi<{ ok: true; records: HabatRecord[] }>(`v3/records?${params.toString()}`),',
  "manager records canonical read endpoint"
);

app = replaceOnce(
  app,
  '  }, [employeeEmail, month, status, today]);',
  '  }, [employeeAccessId, month, status, today]);',
  "manager records refresh dependencies"
);

app = replaceOnce(
  app,
  '<Select value={employeeEmail} onValueChange={setEmployeeEmail}>',
  '<Select value={employeeAccessId} onValueChange={setEmployeeAccessId}>',
  "manager records select state"
);

app = replaceOnce(
  app,
  '<SelectItem key={account.id} value={account.email}>{account.displayName || account.email}</SelectItem>',
  '<SelectItem key={account.id} value={account.id}>{account.displayName || account.email}</SelectItem>',
  "manager records canonical select identity"
);

write(appPath, app);

console.log("Applied Habat Attendance Core Phase 3: manager records now read from the canonical v3 attendance core by access id.");
