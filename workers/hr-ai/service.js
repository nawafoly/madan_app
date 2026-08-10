import { createAiProvider } from "./provider.js";
import { EXTRA_HR_AI_TOOL_DEFINITIONS, executeExtraHrAiTool, isExtraHrAiTool } from "./extra-tools.js";
import { HR_AI_TOOL_DEFINITIONS, executeHrAiTool, getDefaultAiDate } from "./tools.js";
import { isWriteIntent, latestUserMessage, readOnlyBlockedMessage, safeContext, sanitizeConversation } from "./policy.js";

const MAX_TOOL_CALLS = 6;
const ALL_HR_AI_TOOL_DEFINITIONS = [...HR_AI_TOOL_DEFINITIONS, ...EXTRA_HR_AI_TOOL_DEFINITIONS];

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

export function getHelpReply(question, language = "ar") {
  const q = normalizeQuestion(question);
  const asksForHelp = /(?:كلمات.*(?:البحث|تعرفها)|وش.*(?:تعرف|تقدر).*تسوي|ايش.*(?:تعرف|تقدر).*تسوي|ماذا.*تستطيع|كيف.*استخدمك|وش اسالك|ايش اسالك|help|what can you do)/i.test(q);
  if (!asksForHelp) return "";
  if (language === "en") {
    return "You can ask me about: who checked in today, today's attendance actions, missing checkouts, late employees, attendance issues, attendance locations, leave conflicts, employee details, work schedules, monthly attendance summaries, and configured salary by employee name if you have payroll permission. I am read-only and cannot change records.";
  }
  return "تقدر تسألني مثلًا: مين بصم اليوم؟ ايش الإجراءات اللي صارت اليوم؟ مين بدون انصراف؟ مين متأخر؟ مشاكل الحضور اليوم، كم فرع بصمة عندنا ومن بصم في كل موقع، تعارضات الإجازات والحضور، بيانات موظف، جدول دوام موظف، ملخص الحضور لهذا الشهر، أو كم راتب موظف بالاسم إذا عندك صلاحية الرواتب. أنا للقراءة والتحليل فقط ولا أعدّل السجلات.";
}

function extractPayrollEmployeeName(question) {
  const q = normalizeQuestion(question).replace(/[؟?!.،,]+$/g, "").trim();
  const match = q.match(/(?:كم\s+)?(?:راتب|الراتب)\s+(?:حق\s+)?(.+)$/i);
  if (!match) return "";
  return String(match[1] || "")
    .replace(/^(?:الموظف|الموظفة)\s+/i, "")
    .trim()
    .slice(0, 120);
}

function isAttendanceLocationQuestion(question) {
  const q = normalizeQuestion(question);
  return /(?:فرع|فروع|موقع|مواقع).*(?:بصم|بصمة|الحضور|الدوام)|(?:بصم|بصمة).*(?:فرع|فروع|موقع|مواقع)/i.test(q);
}

export function resolveDeterministicToolCalls(question, context) {
  const q = normalizeQuestion(question);
  const date = getDefaultAiDate();

  const payrollEmployeeName = extractPayrollEmployeeName(question);
  if (payrollEmployeeName) {
    return [{ name: "getEmployeeCompensationByName", arguments: { employeeName: payrollEmployeeName } }];
  }
  if (isAttendanceLocationQuestion(q)) {
    return [{ name: "getAttendanceLocationsForDate", arguments: { date } }];
  }
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
    /(?:الموظفين|الموظفون)\s+(?:الحاضرين|الحاضرون|اللي\s+(?:حضروا|بصموا))/i.test(q) ||
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
    ? "I couldn't determine which HR data you want. Ask what I can do, or try: who checked in today, late employees today, missing checkouts, attendance issues today, attendance locations, or an employee's salary."
    : "ما قدرت أحدد بيانات الموارد البشرية المطلوبة بدقة. اسألني: وش تقدر تسوي؟ أو جرّب: مين بصم اليوم؟ المتأخرون اليوم، الموظفون بدون انصراف، مشاكل الحضور اليوم، فروع البصمة، أو كم راتب موظف بالاسم.";
}

function buildPlannerPrompt(context) {
  const today = getDefaultAiDate();
  return `أنت مخطط أدوات لمساعد موارد بشرية Read-Only داخل نظام معدن.\n\nقواعد إلزامية:\n- تاريخ اليوم الحالي في Asia/Riyadh هو ${today}. أي عبارة \"اليوم\" تعني هذا التاريخ تحديدًا.\n- لا تجب من معلوماتك العامة عن بيانات الموظفين. يجب استخدام Tool للحصول على أي حقيقة تشغيلية.\n- لا توجد أي أدوات كتابة. لا تطلب SQL ولا تحاول تعديل أي قاعدة بيانات.\n- استخدم أقل عدد من الأدوات والبيانات اللازمة للسؤال.\n- التواريخ بصيغة YYYY-MM-DD وتوقيت العمل Asia/Riyadh.\n- \"مين بصم اليوم؟\" أو \"مين حضر اليوم؟\" = getAttendanceForDate.\n- \"مشاكل الحضور اليوم\" = getHrSystemDiagnostics.\n- أسئلة فروع/مواقع البصمة = getAttendanceLocationsForDate.\n- سؤال راتب موظف بالاسم = getEmployeeCompensationByName، ويتطلب payroll.view.\n- إذا السؤال عن موظف بالاسم ولا تعرف ID، استخدم searchEmployees أولاً.\n- إذا احتجت تفاصيل مسير راتب لشهر محدد استخدم getEmployeePayrollSummary فقط.\n- لا تخمن قواعد تأخير أو غياب غير موجودة.\n${context?.employeeId ? `سياق الصفحة الحالي employeeId=${context.employeeId}.` : ""}`;
}

function buildAnswerPrompt(language, question) {
  const responseLanguage = language === "en" ? "Answer in clear English." : "أجب بالعربية الواضحة.";
  const locationInstruction = isAttendanceLocationQuestion(question)
    ? "\n- السؤال عن فروع/مواقع البصمة: اعتمد على configuredActiveLocationCount وlocations. اذكر عدد المواقع المفعلة، ثم كل موقع وعدد وأسماء الموظفين الذين ظهرت لهم بصمات فيه في التاريخ المعروض. لا تقل إنهم موجودون فعليًا الآن؛ قل إن لهم بصمات في الموقع خلال اليوم."
    : "";
  const payrollInstruction = extractPayrollEmployeeName(question)
    ? "\n- السؤال عن الراتب: إذا ظهر تطابق واحد فاذكر الراتب الأساسي والبدلات المتوفرة كل حقل باسمه، ولا تحسب صافيًا أو إجماليًا غير موجود في الأداة. إذا ظهر أكثر من تطابق فاطلب تحديد الموظف."
    : "";
  return `أنت \"مساعد معدن AI\" داخل منصة الموارد البشرية. ${responseLanguage}\nالقواعد:\n- اعتمد حصريًا على JSON المرفق من أدوات النظام. لا تخترع أسماء أو أرقام أو حالات.\n- إذا النتيجة فارغة قل بوضوح أنه لا توجد بيانات/حالات مطابقة.\n- اذكر أن حالة اليوم بدون بصمة هي pending فقط إذا كانت الأداة المعروضة تتعلق بالغياب وتنص على ذلك؛ لا تضف هذه العبارة لأسئلة أخرى.\n- إذا كانت نتيجة البحث عن اسم موظف فيها أكثر من تطابق، اعرض الأسماء واطلب تحديد الموظف بدل التخمين.\n- لا تطلب أو تعرض secrets أو tokens أو credentials.\n- لا تقترح أنك نفذت أي تعديل؛ V1 قراءة وتحليل فقط.\n- اجعل الإجابة مختصرة ومنظمة، وعدّد الحالات عند وجودها.${locationInstruction}${payrollInstruction}`;
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
      const toolCtx = {
        hrDb: ctx.env.HR_DB,
        attendanceDb: ctx.env.ATTENDANCE_DB,
        permissions: ctx.requester.permissions,
      };
      const data = isExtraHrAiTool(name)
        ? await executeExtraHrAiTool(name, args, toolCtx)
        : await executeHrAiTool(name, args, toolCtx);
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
  const helpAnswer = getHelpReply(question, language);
  if (helpAnswer) {
    return { ok: true, status: 200, answer: helpAnswer, toolResults: [], blockedAction: false };
  }

  const provider = createAiProvider(ctx.env);
  const allowedNames = new Set(ALL_HR_AI_TOOL_DEFINITIONS.map(tool => tool.name));
  const toolResults = [];
  const executedSignatures = new Set();

  let calls = resolveDeterministicToolCalls(question, context);
  if (!calls.length) {
    try {
      const plan = await provider.selectTools(messages, ALL_HR_AI_TOOL_DEFINITIONS, buildPlannerPrompt(context));
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
      const followUpPlan = await provider.selectTools(followUpMessages, ALL_HR_AI_TOOL_DEFINITIONS, buildPlannerPrompt(context));
      await executeCalls(followUpPlan.calls.slice(0, MAX_TOOL_CALLS - toolResults.length), ctx, allowedNames, toolResults, executedSignatures);
    } catch {
      // The final answer can still be grounded in the first safe tool results.
    }
  }

  if (!toolResults.length) return { ok: false, status: 502, message: "ai_no_safe_tool_result" };
  try {
    const answer = await provider.answer(messages, toolResults, buildAnswerPrompt(language, question));
    return { ok: true, status: 200, answer, toolResults: toolResults.map(item => ({ tool: item.tool, ok: item.ok })), blockedAction: false };
  } catch {
    return { ok: false, status: 502, message: "ai_provider_failed" };
  }
}
