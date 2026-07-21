const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();

function filePath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  return fs
    .readFileSync(filePath(relativePath), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

function write(relativePath, value) {
  fs.mkdirSync(path.dirname(filePath(relativePath)), { recursive: true });
  fs.writeFileSync(
    filePath(relativePath),
    String(value).replace(/\r\n?/g, "\n"),
    "utf8"
  );
}

function fail(message) {
  throw new Error(message);
}

function expectIncludes(source, value, label) {
  if (!source.includes(value)) {
    fail(`Phase 9C: expected ${label || value}`);
  }
}

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`Phase 9C: expected one ${label || "exact block"}, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceRegex(source, regex, after, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) {
    fail(`Phase 9C: expected one ${label || regex}, found ${matches.length}`);
  }
  return source.replace(regex, after);
}

function scanMatching(source, openIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let templateDepth = 0;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }
      if (quote === "`" && char === "$" && next === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && templateDepth > 0) {
        if (char === "{") templateDepth += 1;
        if (char === "}") templateDepth -= 1;
        continue;
      }
      if (char === quote && templateDepth === 0) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      templateDepth = 0;
      continue;
    }

    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  fail(`Phase 9C: unmatched ${openChar}${closeChar}`);
}

function replaceUseEffectContaining(source, anchor, replacement, label) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) fail(`Phase 9C: missing effect anchor ${label || anchor}`);
  const start = source.lastIndexOf("  useEffect(() => {", anchorIndex);
  if (start < 0) fail(`Phase 9C: missing useEffect start for ${label || anchor}`);
  const openParen = source.indexOf("(", start);
  const closeParen = scanMatching(source, openParen, "(", ")");
  let end = closeParen + 1;
  while (/\s/.test(source[end] || "")) end += 1;
  if (source[end] === ";") end += 1;
  return source.slice(0, start) + replacement + source.slice(end);
}

function functionRange(source, name) {
  const marker = `  const ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) fail(`Phase 9C: missing function ${name}`);
  const arrow = source.indexOf("=>", start);
  if (arrow < 0) fail(`Phase 9C: missing arrow for ${name}`);
  const openBrace = source.indexOf("{", arrow);
  const closeBrace = scanMatching(source, openBrace, "{", "}");
  let end = closeBrace + 1;
  while (/\s/.test(source[end] || "")) end += 1;
  if (source[end] === ";") end += 1;
  return { start, end, openBrace, closeBrace };
}

function replaceArrowFunction(source, name, replacement) {
  const range = functionRange(source, name);
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

function transformFunction(source, name, transform) {
  const range = functionRange(source, name);
  const current = source.slice(range.start, range.end);
  const next = transform(current);
  return source.slice(0, range.start) + next + source.slice(range.end);
}

function unwrapD1IfElse(block, label) {
  const condition = "if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {";
  const start = block.indexOf(condition);
  if (start < 0) fail(`Phase 9C: missing D1 conditional in ${label}`);
  const openBrace = block.indexOf("{", start);
  const closeBrace = scanMatching(block, openBrace, "{", "}");
  let cursor = closeBrace + 1;
  while (/\s/.test(block[cursor] || "")) cursor += 1;
  if (!block.startsWith("else", cursor)) {
    fail(`Phase 9C: missing else branch in ${label}`);
  }
  const elseOpen = block.indexOf("{", cursor + 4);
  const elseClose = scanMatching(block, elseOpen, "{", "}");
  const thenBody = block.slice(openBrace + 1, closeBrace);
  return block.slice(0, start) + thenBody + block.slice(elseClose + 1);
}

function keepD1EarlyReturnBranch(block, label) {
  const condition = "if (HR_CORE_D1_ENABLED && isHrCoreConfigured()) {";
  const start = block.indexOf(condition);
  if (start < 0) fail(`Phase 9C: missing D1 conditional in ${label}`);
  const openBrace = block.indexOf("{", start);
  const closeBrace = scanMatching(block, openBrace, "{", "}");
  const thenBody = block.slice(openBrace + 1, closeBrace);

  const catchIndex = block.indexOf("\n    } catch (", closeBrace);
  if (catchIndex < 0) {
    fail(`Phase 9C: missing catch boundary in ${label}`);
  }

  return block.slice(0, start) + thenBody + block.slice(catchIndex);
}

let employees = read("client/src/pages/admin/Employees.tsx");

employees = replaceRegex(
  employees,
  /import\s*\{\s*collection,[\s\S]*?\}\s*from\s*"firebase\/firestore";\s*\n/,
  "",
  "Firestore import"
);

employees = replaceExact(
  employees,
  'import { auth, db } from "@/_core/firebase";',
  'import { auth } from "@/_core/firebase";',
  "Firebase import"
);

employees = employees
  .replace(/\n  AUDIT_ACTIONS,/, "")
  .replace(/\n  auditedDeleteDoc,/, "")
  .replace(/\n  auditedUpdateDoc,/, "")
  .replace(/\n  HR_CORE_D1_ENABLED,/, "")
  .replace(/\n  isHrCoreConfigured,/, "");

employees = replaceExact(
  employees,
  "  listHrCoreLeaveRequests,\n",
  "  listHrCoreLeaveRequests,\n  listHrCoreLeaveBalanceAdjustments,\n",
  "leave request import anchor"
);

employees = replaceExact(
  employees,
  "  updateHrCoreEmployee,\n",
  "  updateHrCoreEmployee,\n  adjustHrCoreEmployeeLeaveBalance,\n",
  "employee update import anchor"
);

employees = employees.replaceAll("serverTimestamp()", "new Date().toISOString()");

employees = replaceUseEffectContaining(
  employees,
  "listHrCoreEmployees({ limit: 500, offset: 0 })",
`  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    void listHrCoreEmployees({ limit: 500, offset: 0 })
      .then(result => {
        if (!active) return;
        const rows = result.employees
          .map(buildEmployeeRecordFromHrCore)
          .sort((a, b) => {
            const aName = pickText(a.displayName, a.name, a.email).toLowerCase();
            const bName = pickText(b.displayName, b.name, b.email).toLowerCase();
            return aName.localeCompare(bName);
          });
        setEmployees(rows);
      })
      .catch(error => {
        console.error("employees_hr_core_load_error", error);
        if (!active) return;
        setEmployees([]);
        setError("تعذر تحميل قائمة الموظفين من Cloudflare.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);`,
  "employee directory"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_absences_hr_core_error"',
`  useEffect(() => {
    if (!selectedEmployeeDocumentId && !selectedEmployeeAuthUid) {
      setEmployeeAbsences([]);
      setEmployeeAbsencesLoading(false);
      return;
    }

    let active = true;
    setEmployeeAbsencesLoading(true);

    void listHrCoreAbsences({
      employeeId: selectedEmployeeDocumentId || undefined,
      employeeUid: selectedEmployeeAuthUid || undefined,
      limit: 500,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setEmployeeAbsences(
          sortEmployeeAbsences(
            result.absences.map(absence =>
              normalizeEmployeeAbsence(absence.id, absence)
            )
          )
        );
      })
      .catch(error => {
        console.error("employee_absences_hr_core_error", error);
        if (active) setEmployeeAbsences([]);
      })
      .finally(() => {
        if (active) setEmployeeAbsencesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedEmployeeDocumentId,
    selectedEmployeeAuthUid,
    hrOperationsRevision,
  ]);`,
  "employee absences"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_payroll_records_hr_core_error"',
`  useEffect(() => {
    if (!selectedEmployeeDocumentId && !selectedEmployeeAuthUid) {
      setEmployeePayrollRecords([]);
      setApprovedPayrollAdvances([]);
      setEmployeePayrollRecordsLoading(false);
      setApprovedPayrollAdvancesLoading(false);
      resetPayrollMudadDocument();
      return;
    }

    let active = true;
    setEmployeePayrollRecordsLoading(true);
    setApprovedPayrollAdvancesLoading(true);

    void Promise.all([
      listHrCorePayrollRecords({
        employeeId: selectedEmployeeDocumentId || undefined,
        employeeUid: selectedEmployeeAuthUid || undefined,
        limit: 200,
      }),
      listHrCorePayrollAdvances({
        employeeId: selectedEmployeeDocumentId || undefined,
        employeeUid: selectedEmployeeAuthUid || undefined,
      }),
    ])
      .then(([payrollResult, advancesResult]) => {
        if (!active) return;
        setEmployeePayrollRecords(
          sortEmployeePayrollRecords(
            payrollResult.payrollRecords.map(record =>
              normalizeEmployeePayrollRecord(
                record.id,
                record as Record<string, any>
              )
            )
          )
        );
        setApprovedPayrollAdvances(advancesResult.advances || []);
      })
      .catch(error => {
        console.error("employee_payroll_records_hr_core_error", error);
        if (!active) return;
        setEmployeePayrollRecords([]);
        setApprovedPayrollAdvances([]);
      })
      .finally(() => {
        if (!active) return;
        setEmployeePayrollRecordsLoading(false);
        setApprovedPayrollAdvancesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmployeeDocumentId, selectedEmployeeAuthUid, payrollRevision]);`,
  "employee payroll"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_leave_requests_hr_core_error"',
`  useEffect(() => {
    if (!selectedEmployeeAuthUid && !selectedEmployeeDocumentId) {
      setLeaveRequests([]);
      setLeaveRequestsLoading(false);
      setReviewNotes({});
      return;
    }

    let active = true;
    setReviewNotes({});
    setLeaveRequestsLoading(true);

    void listHrCoreLeaveRequests({
      employeeId: selectedEmployeeDocumentId || undefined,
      employeeUid: selectedEmployeeAuthUid || undefined,
      limit: 500,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setLeaveRequests(
          sortEmployeeLeaveRequests(
            result.leaveRequests.map(request =>
              normalizeEmployeeLeaveRequest(request.id, request)
            )
          )
        );
      })
      .catch(error => {
        console.error("employee_leave_requests_hr_core_error", error);
        if (active) setLeaveRequests([]);
      })
      .finally(() => {
        if (active) setLeaveRequestsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedEmployeeAuthUid,
    selectedEmployeeDocumentId,
    hrOperationsRevision,
  ]);`,
  "leave requests"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_service_requests_hr_core_error"',
`  useEffect(() => {
    if (!selectedEmployeeAuthUid && !selectedEmployeeDocumentId) {
      setServiceRequests([]);
      setServiceRequestsLoading(false);
      return;
    }

    let active = true;
    setServiceRequestsLoading(true);

    void listHrCoreServiceRequests({
      employeeId: selectedEmployeeDocumentId || undefined,
      employeeUid: selectedEmployeeAuthUid || undefined,
      limit: 500,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setServiceRequests(
          sortEmployeeServiceRequests(
            result.serviceRequests.map(request =>
              normalizeEmployeeServiceRequest(request.id, request)
            )
          )
        );
      })
      .catch(error => {
        console.error("employee_service_requests_hr_core_error", error);
        if (active) setServiceRequests([]);
      })
      .finally(() => {
        if (active) setServiceRequestsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedEmployeeAuthUid,
    selectedEmployeeDocumentId,
    hrOperationsRevision,
  ]);`,
  "service requests"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("leave_balance_adjustments_snapshot_error"',
`  useEffect(() => {
    if (!selectedEmployeeAuthUid && !selectedEmployeeDocumentId) {
      setLeaveBalanceAdjustments([]);
      setLeaveBalanceAdjustmentsLoading(false);
      return;
    }

    let active = true;
    setLeaveBalanceAdjustmentsLoading(true);

    void listHrCoreLeaveBalanceAdjustments({
      employeeId: selectedEmployeeDocumentId || undefined,
      employeeUid: selectedEmployeeAuthUid || undefined,
      limit: 200,
      offset: 0,
    })
      .then(result => {
        if (!active) return;
        setLeaveBalanceAdjustments(
          result.adjustments.map(adjustment => ({
            ...adjustment,
            createdAtDate: toDateSafe(adjustment.createdAt),
          }))
        );
      })
      .catch(error => {
        console.error("leave_balance_adjustments_hr_core_error", error);
        if (active) setLeaveBalanceAdjustments([]);
      })
      .finally(() => {
        if (active) setLeaveBalanceAdjustmentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedEmployeeAuthUid,
    selectedEmployeeDocumentId,
    hrOperationsRevision,
  ]);`,
  "leave balance adjustments"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_files_hr_core_admin_load_failed"',
`  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setEmployeeFiles([]);
      setEmployeeFilesLoading(false);
      return;
    }

    let active = true;
    setEmployeeFilesLoading(true);

    void listHrCoreEmployeeFiles({
      employeeUid: selectedEmployeeAuthUid,
      limit: 200,
    })
      .then(response => {
        if (!active) return;
        setEmployeeFiles(
          sortEmployeeFiles(
            response.employeeFiles.map(file =>
              normalizeEmployeeFileRecord(
                file.id,
                file as Record<string, unknown>
              )
            )
          )
        );
      })
      .catch(error => {
        console.error("employee_files_hr_core_admin_load_failed", error);
        if (active) setEmployeeFiles([]);
      })
      .finally(() => {
        if (active) setEmployeeFilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmployeeAuthUid, hrOperationsRevision]);`,
  "employee files"
);

employees = replaceUseEffectContaining(
  employees,
  'console.error("employee_messages_hr_core_admin_load_failed"',
`  useEffect(() => {
    if (!selectedEmployeeAuthUid) {
      setEmployeeMessages([]);
      setEmployeeMessagesLoading(false);
      return;
    }

    let active = true;
    setEmployeeMessagesLoading(true);

    void listHrCoreEmployeeMessages({
      employeeUid: selectedEmployeeAuthUid,
      limit: 200,
    })
      .then(response => {
        if (!active) return;
        setEmployeeMessages(
          response.employeeMessages.map(message =>
            normalizeEmployeeMessageRecord(
              message.id,
              message as Record<string, any>
            )
          )
        );
      })
      .catch(error => {
        console.error("employee_messages_hr_core_admin_load_failed", error);
        if (active) setEmployeeMessages([]);
      })
      .finally(() => {
        if (active) setEmployeeMessagesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmployeeAuthUid, hrOperationsRevision]);`,
  "employee messages"
);

employees = replaceArrowFunction(
  employees,
  "persistAllowedZoneForSelectedEmployee",
`  const persistAllowedZoneForSelectedEmployee = async (zoneId: string) => {
    const normalizedZoneId = String(zoneId || "").trim();
    const nextAllowedZoneIds = normalizeAllowedZoneIds(
      normalizedZoneId
        ? [...form.allowedZoneIds, normalizedZoneId]
        : form.allowedZoneIds
    );

    setForm(current => ({
      ...current,
      allowedZoneIds: normalizeAllowedZoneIds(
        normalizedZoneId
          ? [...current.allowedZoneIds, normalizedZoneId]
          : current.allowedZoneIds
      ),
    }));

    if (!selectedEmployee || !normalizedZoneId) {
      return nextAllowedZoneIds;
    }

    const employeeId =
      String(selectedEmployee.linkedEmployeeId || "").trim() ||
      selectedEmployee.id;
    const result = await updateHrCoreEmployee(employeeId, {
      allowedZoneIds: nextAllowedZoneIds,
    });
    const refreshedEmployee = buildEmployeeRecordFromHrCore(result.employee);
    setEmployees(current =>
      current.map(employee =>
        employee.id === selectedEmployee.id ? refreshedEmployee : employee
      )
    );

    return nextAllowedZoneIds;
  };`
);

employees = replaceArrowFunction(
  employees,
  "handleCreateEmployeeAbsence",
`  const handleCreateEmployeeAbsence = async () => {
    if (!selectedEmployee || !selectedEmployeeDocumentId) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تسجيل غياب الموظفين.");
      return;
    }

    const normalizedDate = String(absenceForm.date || "").trim();
    const normalizedType = String(absenceForm.type || "")
      .trim()
      .toLowerCase();

    if (!isValidEmployeeAbsenceDate(normalizedDate)) {
      toast.error("اختر تاريخ غياب صالحًا.");
      return;
    }

    if (!["full_day", "half_day"].includes(normalizedType)) {
      toast.error("اختر نوع الغياب.");
      return;
    }

    setSavingAbsence(true);
    try {
      await createHrCoreAbsence({
        employeeId: selectedEmployeeDocumentId,
        employeeUid: selectedEmployeeAuthUid || selectedEmployee.id,
        date: normalizedDate,
        type: normalizedType === "half_day" ? "half_day" : "full_day",
        note: String(absenceForm.note || "").trim() || null,
      });
      setAbsenceForm(buildEmployeeAbsenceFormValues());
      refreshHrOperations();
      toast.success("تم تسجيل الغياب بنجاح في Cloudflare.");
    } catch (error) {
      console.error("employee_absence_create_failed", error);
      toast.error("تعذر تسجيل الغياب.");
    } finally {
      setSavingAbsence(false);
    }
  };`
);

employees = replaceArrowFunction(
  employees,
  "handleDeleteEmployeeAbsence",
`  const handleDeleteEmployeeAbsence = async (
    absence: EmployeeAbsenceRecord
  ) => {
    if (!selectedEmployee || !selectedEmployeeDocumentId) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية حذف غياب الموظفين.");
      return;
    }

    const confirmed = window.confirm(
      \`سيتم حذف غياب \${formatEmployeeAbsenceDate(absence.date)} من سجل الموظف. هل تريد المتابعة؟\`
    );
    if (!confirmed) return;

    setDeletingAbsenceId(absence.id);
    try {
      await deleteHrCoreAbsence(absence.id);
      refreshHrOperations();
      toast.success("تم حذف الغياب من سجل الموظف في Cloudflare.");
    } catch (error) {
      console.error("employee_absence_delete_failed", error);
      toast.error("تعذر حذف الغياب.");
    } finally {
      setDeletingAbsenceId(current =>
        current === absence.id ? null : current
      );
    }
  };`
);

employees = transformFunction(employees, "handleCreatePayrollRecord", block => {
  block = replaceRegex(
    block,
    /      let monthlyAbsences: EmployeeAbsenceRecord\[\];[\s\S]*?\n\n      const manualSalaryDeductions/,
`      const monthlyAbsences = employeeAbsences.filter(
        absence =>
          absence.date >= payrollCalculationStartDate &&
          absence.date <= payrollCalculationEndDate
      );

      const manualSalaryDeductions`,
    "monthly absence source"
  );
  block = unwrapD1IfElse(block, "handleCreatePayrollRecord");
  block = block.replace(
    /entityPath: HR_CORE_D1_ENABLED[\s\S]*?: `\$\{EMPLOYEE_PAYROLL_RECORDS_COLLECTION\}\/\$\{payrollRecordId\}`,/,
    "entityPath: `cloudflare:employee_payroll_records/${payrollRecordId}`,"
  );
  return block;
});

employees = transformFunction(employees, "handleConfirmEmployeeAvatarCrop", block => {
  block = replaceRegex(
    block,
    /      const userRef = doc\(db, "users", selectedEmployee\.id\);[\s\S]*?\n\n      const currentAuthUser = auth\.currentUser;/,
`      const hrCoreResult = await updateHrCoreEmployee(employeeId, {
        avatarUrl: avatarPayload.fileUrl || null,
      });
      const refreshedEmployee = buildEmployeeRecordFromHrCore(
        hrCoreResult.employee
      );
      setEmployees(current =>
        current.map(employee =>
          employee.id === selectedEmployee.id ? refreshedEmployee : employee
        )
      );

      const currentAuthUser = auth.currentUser;`,
    "avatar Firestore persistence"
  );
  return block;
});

employees = transformFunction(
  employees,
  "markEmployeeConversationAsRead",
  block => unwrapD1IfElse(block, "markEmployeeConversationAsRead")
);

employees = transformFunction(employees, "handleSendEmployeeMessage", block => {
  block = block.replace(
    "      const messageRef = doc(db, EMPLOYEE_MESSAGES_COLLECTION, messageId);\n",
    ""
  );
  block = block.replace(
    "activeEmployeeConversation?.conversationId || messageRef.id",
    "activeEmployeeConversation?.conversationId || messageId"
  );
  block = unwrapD1IfElse(block, "handleSendEmployeeMessage");
  block = block.replaceAll("${messageRef.id}", "${messageId}");
  block = block.replaceAll("messageRef.id", "messageId");
  return block;
});

employees = transformFunction(employees, "handleUploadOfficialDocument", block => {
  block = block.replace(
    "      const fileRef = doc(db, EMPLOYEE_FILES_COLLECTION, fileRecordId);\n",
    ""
  );
  block = unwrapD1IfElse(block, "handleUploadOfficialDocument");
  block = block.replace(
    "        entityPath: fileRef.path,",
    "        entityPath: `cloudflare:hr_employee_files/${fileRecordId}`,"
  );
  return block;
});

employees = transformFunction(
  employees,
  "handleDeleteEmployeeFile",
  block => unwrapD1IfElse(block, "handleDeleteEmployeeFile")
);

employees = transformFunction(employees, "handleUploadEmployeeFile", block => {
  block = block.replace(
    "      const fileRef = doc(db, EMPLOYEE_FILES_COLLECTION, fileRecordId);\n",
    ""
  );
  block = unwrapD1IfElse(block, "handleUploadEmployeeFile");
  block = block.replace(
    "        entityPath: fileRef.path,",
    "        entityPath: `cloudflare:hr_employee_files/${fileRecordId}`,"
  );
  return block;
});

employees = transformFunction(employees, "handleSave", block => {
  block = replaceRegex(
    block,
    /      try \{\n        await auditedUpdateDoc\(\{[\s\S]*?\n      if \(HR_CORE_D1_ENABLED && isHrCoreConfigured\(\)\) \{/,
    "      {",
    "employee Firestore save blocks"
  );
  const open = block.indexOf("      {", block.indexOf("const nextEmployment"));
  if (open < 0) fail("Phase 9C: missing direct D1 save block");
  const close = scanMatching(block, open + 6, "{", "}");
  block = block.slice(0, open) + block.slice(open + 7, close) + block.slice(close + 1);
  return block;
});

employees = replaceArrowFunction(
  employees,
  "handleSaveManualLeaveBalance",
`  const handleSaveManualLeaveBalance = async () => {
    if (!selectedEmployee || !selectedEmployeeProfile) return;
    if (!canManageEmployees) {
      toast.error("لا تملك صلاحية تعديل رصيد الإجازات.");
      return;
    }

    const manualBalanceValue = Number(manualLeaveBalance);
    const reason = String(manualLeaveAdjustmentReason || "").trim();
    const operationType =
      manualLeaveBalanceOperation === "deduct" ? "deduct" : "add";

    if (
      !manualLeaveBalance.trim() ||
      !Number.isFinite(manualBalanceValue) ||
      manualBalanceValue < 0
    ) {
      toast.error("أدخل رصيد إجازات صالحًا.");
      return;
    }

    if (
      operationType === "deduct" &&
      (manualBalanceValue <= 0 ||
        manualBalanceValue > currentLeaveBalanceNumber)
    ) {
      toast.error("لا يمكن خصم عدد أيام غير صالح أو أكبر من الرصيد الحالي.");
      return;
    }

    if (!reason) {
      toast.error("اكتب سبب تعديل الرصيد.");
      return;
    }

    setSavingManualLeaveBalance(true);
    try {
      const employeeId =
        selectedEmployeeDocumentId ||
        String(selectedEmployee.linkedEmployeeId || "").trim() ||
        selectedEmployee.id;
      const result = await adjustHrCoreEmployeeLeaveBalance(employeeId, {
        value: manualBalanceValue,
        operationType,
        reason,
      });
      const persistedNextBalance = Number(result.adjustment.nextBalance || 0);
      const refreshedEmployee = buildEmployeeRecordFromHrCore(result.employee);

      setEmployees(current =>
        current.map(employee =>
          employee.id === selectedEmployee.id ? refreshedEmployee : employee
        )
      );
      setLeaveBalanceAdjustments(current => [
        {
          ...result.adjustment,
          createdAtDate: toDateSafe(result.adjustment.createdAt),
        },
        ...current.filter(item => item.id !== result.adjustment.id),
      ]);
      setForm(current => ({
        ...current,
        leaveBalance: String(persistedNextBalance),
      }));
      setManualLeaveBalance(String(persistedNextBalance));
      setManualLeaveBalanceOperation("add");
      setManualLeaveAdjustmentReason("");
      refreshHrOperations();

      toast.success(
        tr(
          language,
          "تم تعديل رصيد الإجازات يدويًا.",
          "Leave balance was adjusted manually."
        )
      );
    } catch (error) {
      console.error("manual_leave_balance_update_failed", error);
      toast.error(
        tr(
          language,
          "تعذر تعديل رصيد الإجازات.",
          "Could not adjust leave balance."
        )
      );
    } finally {
      setSavingManualLeaveBalance(false);
    }
  };`
);

for (const name of [
  "handleCreateEmergencyLeaveForToday",
  "handleReviewLeaveRequest",
  "handleReviewServiceRequest",
]) {
  employees = transformFunction(
    employees,
    name,
    block => unwrapD1IfElse(block, name)
  );
}

employees = transformFunction(
  employees,
  "handleCancelApprovedLeaveForDate",
  block =>
    keepD1EarlyReturnBranch(
      block,
      "handleCancelApprovedLeaveForDate"
    )
);

employees = employees
  .replace(/\nconst EMPLOYEE_LEAVE_BALANCE_ADJUSTMENTS_COLLECTION =\n  "employee_leave_balance_adjustments";\n/, "\n")
  .replace(/\n  EMPLOYEE_ABSENCES_COLLECTION,/, "")
  .replace(/\n  buildEmployeeAbsencePayload,/, "")
  .replace(/\n  EMPLOYEE_FILES_COLLECTION,/, "")
  .replace(/\n  buildEmployeeAvatarPatch,/, "")
  .replace(/\n  EMPLOYEE_LEAVE_REQUESTS_COLLECTION,/, "")
  .replace(/\n  buildEmployeeLeaveRequestPayload,/, "")
      .replace(/\n  EMPLOYEE_SERVICE_REQUESTS_COLLECTION,/, "")
  .replace(/\n  EMPLOYEE_PAYROLL_RECORDS_COLLECTION,/, "")
  .replace(/\n  EmployeeLeaveRequestDoc,/, "")
  .replace(/\nimport \{ EMPLOYEE_MESSAGES_COLLECTION \} from "@shared\/employee";/, "");

const forbiddenEmployeePatterns = [
  ["firebase/firestore", "Firestore import"],
  ["HR_CORE_D1_ENABLED", "D1 feature flag"],
  ["isHrCoreConfigured", "D1 fallback check"],
  ["collection(", "Firestore collection"],
  ["doc(", "Firestore document"],
  ["getDocs(", "Firestore getDocs"],
  ["onSnapshot(", "Firestore snapshot"],
  ["runTransaction(", "Firestore transaction"],
  ["setDoc(", "Firestore setDoc"],
  ["writeBatch(", "Firestore batch"],
  ["serverTimestamp(", "Firestore timestamp"],
  ["messageRef.id", "removed Firestore message reference"],
  [" db,", "Firestore db parameter"],
  ["db,", "Firestore db parameter"],
];

for (const [pattern, label] of forbiddenEmployeePatterns) {
  if (employees.includes(pattern)) {
    fail(`Phase 9C: ${label} remains in Employees.tsx`);
  }
}

write("client/src/pages/admin/Employees.tsx", employees);

let api = read("client/src/lib/hrCoreApi.ts");
if (!api.includes("export type HrCoreLeaveBalanceAdjustment")) {
  api += `

export type HrCoreLeaveBalanceAdjustment = {
  id: string;
  employeeId: string;
  employeeUid: string | null;
  employeeName: string | null;
  previousBalance: number;
  nextBalance: number;
  difference: number;
  operationType: "add" | "deduct" | string;
  operationLabel: string;
  reason: string;
  createdByUid: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listHrCoreLeaveBalanceAdjustments(
  input: {
    employeeId?: string;
    employeeUid?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  if (input.employeeId) params.set("employeeId", input.employeeId);
  if (input.employeeUid) params.set("employeeUid", input.employeeUid);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));
  return requestHrCore<{
    ok: true;
    adjustments: HrCoreLeaveBalanceAdjustment[];
    pagination: HrCorePagination;
  }>("/api/hr/leave-balance-adjustments", {}, params);
}

export async function adjustHrCoreEmployeeLeaveBalance(
  employeeId: string,
  input: {
    value: number;
    operationType: "add" | "deduct";
    reason: string;
  }
) {
  return requestHrCore<{
    ok: true;
    employee: HrCoreEmployee;
    adjustment: HrCoreLeaveBalanceAdjustment;
  }>(
    \`/api/hr/employees/\${encodeURIComponent(employeeId)}/leave-balance-adjustments\`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}
`;
}
write("client/src/lib/hrCoreApi.ts", api);

let worker = read("workers/hr-core-worker.js");
worker = replaceExact(
  worker,
  'const HR_WORKER_RELEASE = "phase9b-self-service-profile-v1";',
  'const HR_WORKER_RELEASE = "phase9c-employee-admin-cutover-v1";',
  "worker release"
);

worker = replaceExact(
  worker,
  `  if (pathname === "/api/hr/leave-requests" && request.method === "GET") {
    return listLeaveRequests(url, env.HR_DB, requester);
  }
`,
`  if (pathname === "/api/hr/leave-balance-adjustments" && request.method === "GET") {
    if (!canReadEmployees(requester)) {
      return forbidden("employees_view_forbidden");
    }
    return listLeaveBalanceAdjustments(url, env.HR_DB);
  }

  const leaveBalanceAdjustmentMatch = pathname.match(
    /^\\/api\\/hr\\/employees\\/([^/]+)\\/leave-balance-adjustments$/
  );
  if (leaveBalanceAdjustmentMatch && request.method === "POST") {
    if (!canManageEmployees(requester)) {
      return forbidden("employees_manage_forbidden");
    }
    return adjustEmployeeLeaveBalance(
      request,
      env.HR_DB,
      requester,
      decodeURIComponent(leaveBalanceAdjustmentMatch[1])
    );
  }

  if (pathname === "/api/hr/leave-requests" && request.method === "GET") {
    return listLeaveRequests(url, env.HR_DB, requester);
  }
`,
  "leave route anchor"
);

worker = replaceExact(
  worker,
  "           (SELECT COUNT(*) FROM hr_employee_messages) AS employee_message_count`",
  "           (SELECT COUNT(*) FROM hr_employee_messages) AS employee_message_count,\n           (SELECT COUNT(*) FROM employee_leave_balance_adjustments) AS leave_balance_adjustment_count`",
  "health query"
);

worker = replaceExact(
  worker,
  "      employeeMessageCount: Number(row?.employee_message_count || 0),",
  "      employeeMessageCount: Number(row?.employee_message_count || 0),\n      leaveBalanceAdjustmentCount: Number(row?.leave_balance_adjustment_count || 0),",
  "health response"
);

const workerFunctions = `
export function normalizeLeaveBalanceAdjustmentPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "invalid_leave_balance_adjustment_payload" };
  }

  const operationType =
    normalizeText(value.operationType).toLowerCase() === "deduct"
      ? "deduct"
      : "add";
  const amount = Number(value.value);
  const reason = normalizeText(value.reason);

  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: "leave_balance_value_invalid" };
  }
  if (operationType === "deduct" && amount <= 0) {
    return { ok: false, message: "leave_balance_deduction_invalid" };
  }
  if (!reason) {
    return { ok: false, message: "leave_balance_reason_required" };
  }

  return {
    ok: true,
    value: {
      operationType,
      amount,
      reason,
    },
  };
}

function mapLeaveBalanceAdjustmentRow(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeUid: row.employee_uid || null,
    employeeName: row.employee_name || null,
    previousBalance: Number(row.previous_balance || 0),
    nextBalance: Number(row.next_balance || 0),
    difference: Number(row.difference || 0),
    operationType: row.operation_type,
    operationLabel: row.operation_label || "",
    reason: row.reason,
    createdByUid: row.created_by_uid || null,
    createdByEmail: row.created_by_email || null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
  };
}

async function listLeaveBalanceAdjustments(url, db) {
  const query = parseListQuery(url.searchParams);
  const employeeId = normalizeText(url.searchParams.get("employeeId"));
  const employeeUid = normalizeText(url.searchParams.get("employeeUid"));
  const filters = [];
  const bindings = [];

  if (employeeId) {
    filters.push("employee_id = ?");
    bindings.push(employeeId);
  }
  if (employeeUid) {
    filters.push("employee_uid = ?");
    bindings.push(employeeUid);
  }

  const whereSql = filters.length ? \`WHERE \${filters.join(" AND ")}\` : "";

  try {
    const result = await db.batch([
      db
        .prepare(
          \`SELECT *
           FROM employee_leave_balance_adjustments
           \${whereSql}
           ORDER BY created_at DESC, id DESC
           LIMIT ? OFFSET ?\`
        )
        .bind(...bindings, query.limit, query.offset),
      db
        .prepare(
          \`SELECT COUNT(*) AS total
           FROM employee_leave_balance_adjustments
           \${whereSql}\`
        )
        .bind(...bindings),
    ]);

    const rows = result[0]?.results || [];
    const total = Number(result[1]?.results?.[0]?.total || 0);
    return json(200, {
      ok: true,
      adjustments: rows.map(mapLeaveBalanceAdjustmentRow),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasMore: query.offset + rows.length < total,
      },
    });
  } catch (error) {
    return serverError("leave_balance_adjustments_query_failed", error);
  }
}

async function adjustEmployeeLeaveBalance(request, db, requester, id) {
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) return bodyResult.response;

  const payload = normalizeLeaveBalanceAdjustmentPayload(bodyResult.value);
  if (!payload.ok) {
    return json(400, { ok: false, message: payload.message });
  }

  const before = await db
    .prepare("SELECT * FROM employees WHERE id = ? OR auth_uid = ? LIMIT 1")
    .bind(id, id)
    .first();
  if (!before) return json(404, { ok: false, message: "employee_not_found" });

  const previousBalance = Number(before.leave_balance || 0);
  const nextBalance =
    payload.value.operationType === "deduct"
      ? previousBalance - payload.value.amount
      : payload.value.amount;

  if (!Number.isFinite(nextBalance) || nextBalance < 0) {
    return json(409, { ok: false, message: "leave_balance_insufficient" });
  }

  const now = new Date().toISOString();
  const adjustmentId = crypto.randomUUID();
  const operationLabel =
    payload.value.operationType === "deduct" ? "خصم" : "إضافة";

  let employment = {};
  try {
    employment = before.employment_json
      ? JSON.parse(before.employment_json)
      : {};
  } catch {
    employment = {};
  }
  employment = {
    ...employment,
    leaveBalance: nextBalance,
    leaveBalanceAdjustmentMeta: {
      previousBalance,
      nextBalance,
      operationType: payload.value.operationType,
      operationLabel,
      reason: payload.value.reason,
      adjustedAt: now,
      adjustedByUid: requester.uid,
      adjustedByEmail: requester.email || null,
    },
    updatedAt: now,
    updatedByUid: requester.uid,
    updatedByEmail: requester.email || null,
  };

  const adjustmentRow = {
    id: adjustmentId,
    employee_id: before.id,
    employee_uid: before.auth_uid || null,
    employee_name: before.name || null,
    previous_balance: previousBalance,
    next_balance: nextBalance,
    difference: nextBalance - previousBalance,
    operation_type: payload.value.operationType,
    operation_label: operationLabel,
    reason: payload.value.reason,
    created_by_uid: requester.uid,
    created_by_email: requester.email || null,
    created_by_name:
      requester.account?.display_name || requester.email || null,
    created_at: now,
  };

  try {
    await db.batch([
      db
        .prepare(
          \`UPDATE employees
           SET leave_balance = ?, employment_json = ?, updated_at = ?
           WHERE id = ?\`
        )
        .bind(nextBalance, JSON.stringify(employment), now, before.id),
      db
        .prepare(
          \`INSERT INTO employee_leave_balance_adjustments (
             id, employee_id, employee_uid, employee_name,
             previous_balance, next_balance, difference,
             operation_type, operation_label, reason,
             created_by_uid, created_by_email, created_by_name, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`
        )
        .bind(
          adjustmentRow.id,
          adjustmentRow.employee_id,
          adjustmentRow.employee_uid,
          adjustmentRow.employee_name,
          adjustmentRow.previous_balance,
          adjustmentRow.next_balance,
          adjustmentRow.difference,
          adjustmentRow.operation_type,
          adjustmentRow.operation_label,
          adjustmentRow.reason,
          adjustmentRow.created_by_uid,
          adjustmentRow.created_by_email,
          adjustmentRow.created_by_name,
          adjustmentRow.created_at
        ),
      buildAuditStatement(db, request, requester, {
        action: "employee.leave_balance.adjust",
        entityType: "employee",
        entityId: before.id,
        before: { leaveBalance: previousBalance },
        after: {
          leaveBalance: nextBalance,
          operationType: payload.value.operationType,
          reason: payload.value.reason,
          adjustmentId,
        },
      }),
    ]);

    const updated = await db
      .prepare(
        \`SELECT
           e.*,
           a.role_key AS account_role,
           a.is_active AS account_is_active,
           a.employee_profile_enabled
         FROM employees e
         LEFT JOIN accounts a ON a.uid = e.auth_uid
         WHERE e.id = ?
         LIMIT 1\`
      )
      .bind(before.id)
      .first();

    return json(200, {
      ok: true,
      employee: mapEmployeeRow(updated),
      adjustment: mapLeaveBalanceAdjustmentRow(adjustmentRow),
    });
  } catch (error) {
    return databaseMutationError("leave_balance_adjustment_failed", error);
  }
}

`;

worker = replaceExact(
  worker,
  "async function listEmployees(url, db) {",
  `${workerFunctions}async function listEmployees(url, db) {`,
  "worker function anchor"
);

write("workers/hr-core-worker.js", worker);

const migrationPath = "workers/hr-migrations/0007_employee_leave_balance_adjustments.sql";
if (!fs.existsSync(filePath(migrationPath))) {
  write(
    migrationPath,
`CREATE TABLE IF NOT EXISTS employee_leave_balance_adjustments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  employee_uid TEXT,
  employee_name TEXT,
  previous_balance REAL NOT NULL,
  next_balance REAL NOT NULL,
  difference REAL NOT NULL,
  operation_type TEXT NOT NULL,
  operation_label TEXT,
  reason TEXT NOT NULL,
  created_by_uid TEXT,
  created_by_email TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_employee_created
  ON employee_leave_balance_adjustments(employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_balance_adjustments_uid_created
  ON employee_leave_balance_adjustments(employee_uid, created_at DESC);
`
  );
}

const sourceCheck = read("client/src/pages/admin/Employees.tsx");
if (/firebase\/firestore|HR_CORE_D1_ENABLED|isHrCoreConfigured/.test(sourceCheck)) {
  fail("Phase 9C: Firestore fallback markers remain in Employees.tsx");
}

console.log(
  "Phase 9C applied: admin employee management is D1-only, including leave-balance history."
);
