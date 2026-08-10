const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function extractResponseText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  if (typeof result?.result?.response === "string") return result.result.response.trim();
  return "";
}

export class WorkersAiProvider {
  constructor(aiBinding, model) {
    if (!aiBinding?.run) throw new Error("workers_ai_binding_missing");
    this.ai = aiBinding;
    this.model = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  async selectTools(messages, tools, systemPrompt) {
    const result = await this.ai.run(this.model, {
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools,
      max_tokens: 900,
      temperature: 0.1,
    });
    const calls = Array.isArray(result?.tool_calls) ? result.tool_calls : [];
    return { calls, directText: extractResponseText(result) };
  }

  async answer(messages, toolResults, systemPrompt) {
    const result = await this.ai.run(this.model, {
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
        { role: "user", content: `نتائج أدوات النظام الموثوقة بصيغة JSON:\n${JSON.stringify(toolResults)}` },
      ],
      max_tokens: 1400,
      temperature: 0.2,
    });
    const response = extractResponseText(result);
    if (!response) throw new Error("ai_provider_empty_response");
    return response;
  }
}

export function createAiProvider(env) {
  return new WorkersAiProvider(env?.AI, env?.AI_MODEL);
}
