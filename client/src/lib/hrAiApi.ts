import { auth } from "@/_core/firebase";

const HR_CORE_API_URL = String(import.meta.env.VITE_HR_CORE_API_URL ?? "").trim();

export type HrAiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HrAiContext = {
  route?: string | null;
  employeeId?: string | null;
};

export type HrAiChatResponse = {
  ok: boolean;
  answer?: string;
  message?: string;
  blockedAction?: boolean;
  toolResults?: Array<{ tool: string; ok: boolean }>;
};

function buildUrl(pathname: string) {
  if (!HR_CORE_API_URL) throw new Error("VITE_HR_CORE_API_URL is not configured.");
  const base = HR_CORE_API_URL.endsWith("/") ? HR_CORE_API_URL.slice(0, -1) : HR_CORE_API_URL;
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export async function sendHrAiMessage(input: {
  messages: HrAiMessage[];
  language?: "ar" | "en";
  context?: HrAiContext | null;
  signal?: AbortSignal;
}): Promise<HrAiChatResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Authentication required.");
  const token = await currentUser.getIdToken();
  const response = await fetch(buildUrl("/api/hr/ai/chat"), {
    method: "POST",
    signal: input.signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: input.messages.slice(-12),
      language: input.language === "en" ? "en" : "ar",
      context: input.context || undefined,
    }),
  });
  const payload = (await response.json().catch(() => null)) as HrAiChatResponse | null;
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.message || `HR AI request failed (${response.status}).`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = payload?.message;
    throw error;
  }
  return payload;
}
