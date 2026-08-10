const WRITE_PATTERNS = [
  /(?:عدل|عدّل|تعديل)\s+(?:حضور|انصراف|سجل|راتب|إجازة|اجازة|جدول|بيانات|الموظف|موظف)/i,
  /(?:غيّر|غير)\s+(?:حضور|انصراف|سجل|راتب|إجازة|اجازة|جدول|بيانات|دوام|وقت)/i,
  /(?:احذف|حذف|اضف|أضف|سجل\s+حضور|سجّل\s+حضور|اعتمد|اعتماد|ارفض|رفض|صحح|صحّح|اصلح|أصلح)/i,
  /\b(?:update|edit|delete|remove|insert|create|approve|reject|fix|mutate|write)\b/i,
];

export function isWriteIntent(text) {
  const value = String(text || "").trim();
  return Boolean(value) && WRITE_PATTERNS.some(pattern => pattern.test(value));
}

export function readOnlyBlockedMessage(language = "ar") {
  return language === "en"
    ? "The current version of Maedin AI is read-only. It can analyze HR data and explain issues, but it cannot modify attendance, employees, payroll, leave, or schedules."
    : "الإصدار الحالي من مساعد معدن AI مخصص للقراءة والتحليل فقط. أستطيع تحليل البيانات وشرح المشكلة، لكن لا يمكنني تعديل الحضور أو الموظفين أو الرواتب أو الإجازات أو الجداول.";
}

export function sanitizeConversation(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && ["user", "assistant"].includes(message.role))
    .slice(-12)
    .map(message => ({
      role: message.role,
      content: String(message.content || "").trim().slice(0, 4000),
    }))
    .filter(message => message.content);
}

export function latestUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index].content;
  }
  return "";
}

export function safeContext(context) {
  if (!context || typeof context !== "object") return null;
  const employeeId = String(context.employeeId || "").trim().slice(0, 128);
  const route = String(context.route || "").trim().slice(0, 256);
  return employeeId || route ? { employeeId: employeeId || null, route: route || null } : null;
}

export function canUseHrAi(requester) {
  return Boolean(requester?.permissions?.includes?.("hr_ai.view"));
}
