import { createAiProvider } from "./provider.js";
import { HR_AI_TOOL_DEFINITIONS, executeHrAiTool, getDefaultAiDate } from "./tools.js";
import { isWriteIntent, latestUserMessage, readOnlyBlockedMessage, safeContext, sanitizeConversation } from "./policy.js";

const MAX_TOOL_CALLS = 6;

function normalizeArgs(call) {
  const value = call?.arguments ?? call?.args ?? call?.function?.arguments ?? {};
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
  }
  return {};
}

function normalizeQuestion(question) {
  return String(question || "")
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/\s+/g, " ");
}

export function getSmallTalkReply(question, language = "ar") {
  const q = normalizeQuestion(question).replace(/[!؟?.،,]+$/g, "").trim();
  if (/^(?:السلام(?:\s+ع\S*)?|سلام(?:\s+ع\S*)?|هلا|هلا والله|مرحبا|اهلا|أهلا|hi|hello|hey)$/.test(q)) {
    return language === "en"
      ? "Hello. I can help you read and analyze HR, attendance, leave, and payroll data."
      : "وعليكم السلام ورحمة الله وبركاته. أقدر أساعدك في قراءة وتحليل بيانات الموظفين والحضور والإجازات والرواتب.";
  }
  if (/^(?:شكرا|شكراً|مشكور|يعطيك العافيه|يعطيك العافية|thanks|thank you)$/.test(q)) {
    return language === "en" ? "You’re welcome." : "العفو، بالخدمة.";
  }
  return "";
}

export function resolveDeterministicToolCalls(question, context) {
  const q = normalizeQuestion(question);
  const date = getDefaultAiDate();

  if (/(ملخص.*الشهر|هذا الشهر|الشهر الحالي|monthly summary)/i.test(q)) {
    return [{ name: "getAttendanceSummary", arguments: { dateFrom: `${date.slice(0, 7)}-01`, dateTo: date } }];
  }
  if (/(بدون انصراف|ما سجل انصراف|لم يسجل انصراف|ناقص.*انصراف|missing checkout)/i.test(q)) {
    return [{ name: "getMissingCheckouts", arguments: { date } }];
  }
  if (/(متأخر|المتاخر|التأخير|التاخير|late)/i.test(q)) {
    return [{ name: "getLateEmployees", arguments: { date } }];
  }
  if (/(غايب|غائب|غياب|absent)/i.test(q)) {
    return [{ name: "getAbsentEmployees", arguments: { date } }];
  }
  if (/(إجازة.*حضور|اجازة.*حضور|حضور.*إجازة|حضور.*اجازة|تعارض|conflict)/i.test(q)) {
    return [{ name: "getAttendanceConflicts", arguments: { date } }];
  }
  if (/(مشاكل|تشخيص|غير منطقي|يتيمة|mapping|مربوط|diagnostic)/i.test(q)) {
    return [{ name: "getHrSystemDiagnostics", arguments: { date } }];
  }

  const asksTodayAttendance =
    /(?:مين|من)\s+.*(?:بصم|حضر|داوم|سجل.*(?:دخول|حضور|انصراف))/i.test(q) ||
    /(?:بصمات?|الحضور|الدوام|الحركات|الاجراءات|الإجراءات|الاجرائات|اجراءات).*اليوم/i.test(q) ||
    /اليوم.*(?:بصم|حضر|داوم|حضور|انصراف|حركات|اجراءات|إجراءات|الاجرائات)/i.test(q);
  if (asksTodayAttendance) {
    return [{ name: "getAttendanceForDate", arguments: { date } }];
  }

  if (context?.employeeId) {
    return [{ name: "getEmployeeSummary", arguments: { employeeId: context.employeeId } }];
  }
  return [];
}

function clarificationMessage(language) {
  return language === "en"
    ? "I couldn't determine which HR data you want. Try: who checked in today, late employees today, missing checkouts, or attendance issues today."
    : "ما قدرت أحدد بيانات الموارد البشرية المطلوبة بدقة. جرّب مثلًا: مين بصم اليوم؟ المتأخرون اليوم، الموظفون بدون انصراف، أو مشاكل الحضور اليوم.";
}

function buildPlannerPrompt(context) {
  const today = getDefaultAiDate();
  return `أنت مخطط أدوات لمساعد موارد بشرية Read-Only داخل نظام معدن.\n\nقواعد إلزامية:\n- تاريخ اليوم الحالي في Asia/Riyadh هو ${today}. أي عبارة \"اليوم\" تعني هذا التاريخ تحديدًا.\n- لا تجب من معلوماتك العامة عن بيانات الموظفين. يجب استخدام Tool للحصول على أي حقيقة تشغيلية.\n- لا توجد أي أدوات كتابة. لا تطلب SQL ولا تحاول تعديل أي قاعدة بيانات.\n- استخدم أقل عدد من الأدوات والبيانات اللازمة للسؤال.\n- التواريخ بصيغة YYYY-MM-DD وتوقيت العمل Asia/Riyadh.\n- \"مين بصم اليوم؟\" أو \"مين حضر اليوم؟\" = getAttendanceForDate.\n- \"مشاكل الحضور اليوم\" = getHrSystemDiagnostics.\n- إذا السؤال عن موظف بالاسم ولا تعرف ID، استخدم searchEmployees أولاً.\n- إذا احتجت بيانات رواتب استخدم getEmployeePayrollSummary فقط، وسيُطبق السيرفر صلاحية payroll.view.\n- لا تخمن قواعد تأخير أو غياب غير موجودة.\n${context?.employeeId ? `سياق الصفحة الحالي employeeId=${context.employeeId}.` : ""}`;
}

function buildAnswerPrompt(language) {
  const responseLanguage = language === "en" ? "Answer in clear English." : "أجب بالعربية الواضحة.";
  return `أنت "مساعد معدن AI" داخل منصة الموارد البشرية. ${responseLanguage}\nالقواعد:\n- اعتمد حصريًا على JSON المرفق من أدوات النظام. لا تخترع أسماء أو أرقام أو حالات.\n- إذا النتيجة فارغة قل بوضوح أنه لا توجد بيانات/حالات مطابقة.\n- اذكر أن حالة اليوم بدون بصمة هي pending إذا كانت الأداة تنص على ذلك، ولا تسمها غيابًا.\n- لا تطلب أو تعرض secrets أو tokens أو credentials.\n- لا تقترح أنك نفذت أي تعديل؛ V1 قراءة وتحليل فقط.\n- اجعل الإجابة مختصرة ومنظمة، وعدّد الحالات عند وجودها.`;
}

async function executeCalls(calls, ctx, allowedNames, toolResults, executedSignatures) {
  for (const call of calls) {
    if (toolResults.length >= MAX_TOOL_CALLS) break;
    const name = String(call?.name || call?.function?.name || "").trim();
    if (!allowedNames.has(name)) continue;
    const args = normalizeArgs(call);
    const signature = `${name}:${JSON.stringify(args)}`;
    if (executedSignatures.has(signature)) continue;
    executedSignatures.add(signature);
    const started = Date.now();
    try {
      const data = await executeHrAiTool(name, args, {
        hrDb: ctx.env.HR_DB,
        attendanceDb: ctx.env.ATTENDANCE_DB,
        permissions: ctx.requester.permissions,
      });
      toolResults.push({ tool: name, ok: true, data });
      console.info(JSON.stringify({ event: "hr_ai_tool", timestamp: new Date().toISOString(), uid: ctx.requester.uid, tool: name, ok: true, durationMs: Date.now() - started }));
    } catch (error) {
      const code = String(error?.message || "hr_ai_tool_failed");
      toolResults.push({ tool: name, ok: false, error: code });
      console.info(JSON.stringify({ event: "hr_ai_tool", timestamp: new Date().toISOString(), uid: ctx.requester.uid, tool: name, ok: false, durationMs: Date.now() - started }));
    }
  }
}

export async function handleHrAiChat(body, ctx) {
  const messages = sanitizeConversation(body?.messages);
  const question = latestUserMessage(messages);
  const language = body?.language === "en" ? "en" : "ar";
  const context = safeContext(body?.context);
  if (!question) return { ok: false, status: 400, message: "missing_ai_question" };
  if (isWriteIntent(question)) return { ok: true, status: 200, answer: readOnlyBlockedMessage(language), toolResults: [], blockedAction: true };
  const smallTalkAnswer = getSmallTalkReply(question, language);
  if (smallTalkAnswer) {
    return { ok: true, status: 200, answer: smallTalkAnswer, toolResults: [], blockedAction: false };
  }

  const provider = createAiProvider(ctx.env);
  const allowedNames = new Set(HR_AI_TOOL_DEFINITIONS.map(tool => tool.name));
  const toolResults = [];
  const executedSignatures = new Set();

  let calls = resolveDeterministicToolCalls(question, context);
  if (!calls.length) {
    try {
      const plan = await provider.selectTools(messages, HR_AI_TOOL_DEFINITIONS, buildPlannerPrompt(context));
      calls = plan.calls.slice(0, MAX_TOOL_CALLS);
    } catch {
      calls = [];
    }
  }
  if (!calls.length) {
    return { ok: true, status: 200, answer: clarificationMessage(language), toolResults: [], blockedAction: false };
  }
  await executeCalls(calls, ctx, allowedNames, toolResults, executedSignatures);

  // A second bounded planning round enables safe name -> employeeId -> detail queries
  // without exposing SQL or database handles to the model.
  if (toolResults.length < MAX_TOOL_CALLS && toolResults.some(item => item.tool === "searchEmployees" && item.ok)) {
    try {
      const followUpMessages = [
        ...messages,
        { role: "user", content: `نتائج الأدوات الأولية:\n${JSON.stringify(toolResults)}\nإذا كانت الإجابة تحتاج بيانات إضافية، اطلب فقط الأدوات الإضافية اللازمة الآن.` },
      ];
      const followUpPlan = await provider.selectTools(followUpMessages, HR_AI_TOOL_DEFINITIONS, buildPlannerPrompt(context));
      await executeCalls(followUpPlan.calls.slice(0, MAX_TOOL_CALLS - toolResults.length), ctx, allowedNames, toolResults, executedSignatures);
    } catch {
      // The final answer can still be grounded in the first safe tool results.
    }
  }

  if (!toolResults.length) return { ok: false, status: 502, message: "ai_no_safe_tool_result" };
  try {
    const answer = await provider.answer(messages, toolResults, buildAnswerPrompt(language));
    return { ok: true, status: 200, answer, toolResults: toolResults.map(item => ({ tool: item.tool, ok: item.ok })), blockedAction: false };
  } catch {
    return { ok: false, status: 502, message: "ai_provider_failed" };
  }
}
