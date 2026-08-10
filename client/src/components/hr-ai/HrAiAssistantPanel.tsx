import { useMemo, useRef, useState } from "react";
import { Bot, ShieldCheck } from "lucide-react";

import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { tr } from "@/lib/i18n";
import { sendHrAiMessage, type HrAiMessage } from "@/lib/hrAiApi";

const QUICK_ACTIONS_AR = [
  "مشاكل الحضور اليوم",
  "الموظفون بدون انصراف",
  "المتأخرون اليوم",
  "الغائبون اليوم",
  "تعارضات الإجازات والحضور",
  "ملخص هذا الشهر",
];

const QUICK_ACTIONS_EN = [
  "Attendance issues today",
  "Employees missing checkout",
  "Late employees today",
  "Absent employees today",
  "Leave and attendance conflicts",
  "Attendance summary this month",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string | null;
  route?: string | null;
};

export function HrAiAssistantPanel({ open, onOpenChange, employeeId, route }: Props) {
  const { language } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestedPrompts = useMemo(
    () => (language === "ar" ? QUICK_ACTIONS_AR : QUICK_ACTIONS_EN),
    [language]
  );

  const handleSendMessage = async (content: string) => {
    if (isLoading) return;
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setError(null);
    setIsLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await sendHrAiMessage({
        messages: nextMessages
          .filter((message): message is HrAiMessage => message.role !== "system")
          .map(message => ({ role: message.role, content: message.content })),
        language: language === "en" ? "en" : "ar",
        context: { employeeId: employeeId || null, route: route || null },
        signal: controller.signal,
      });
      setMessages(current => [
        ...current,
        {
          role: "assistant",
          content:
            response.answer ||
            tr(language, "لم يرجع المساعد إجابة من بيانات النظام.", "The assistant returned no system-data answer."),
        },
      ]);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      const code = (requestError as Error & { code?: string })?.code;
      setError(
        code === "hr_ai_view_forbidden"
          ? tr(language, "ليس لديك صلاحية استخدام مساعد معدن AI.", "You do not have permission to use Maedin AI.")
          : tr(language, "تعذر تشغيل المساعد الآن. حاول مرة أخرى.", "The assistant is unavailable right now. Try again.")
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={language === "ar" ? "left" : "right"}
        dir={language === "ar" ? "rtl" : "ltr"}
        className="w-[min(100vw,520px)] sm:max-w-[520px] gap-0 p-0"
      >
        <SheetHeader className="border-b border-slate-200/80 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-3 pe-7">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-black">
                {tr(language, "مساعد معدن AI", "Maedin AI Assistant")}
              </SheetTitle>
              <SheetDescription className="mt-1 flex items-center gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                {tr(language, "قراءة وتحليل فقط — لا ينفذ أي تعديل", "Read-only analysis — no changes can be executed")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {error ? (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 p-3 sm:p-4">
          <AIChatBox
            messages={messages}
            onSendMessage={content => void handleSendMessage(content)}
            isLoading={isLoading}
            height="100%"
            className="h-full min-h-[480px] border-0 shadow-none"
            placeholder={tr(
              language,
              "اسأل عن الموظفين، الحضور، الانصراف، الإجازات...",
              "Ask about employees, attendance, leave, payroll..."
            )}
            emptyStateMessage={tr(
              language,
              "اسأل عن بيانات HR الفعلية وسيستخدم المساعد أدوات النظام للبحث.",
              "Ask about live HR data and the assistant will use system tools."
            )}
            suggestedPrompts={suggestedPrompts}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
