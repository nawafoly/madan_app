const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const ALLOWED_FINISH_LEVELS = new Set(["اقتصادي", "متوسط", "فاخر"]);

function json(data, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeBase64Size(base64) {
  const cleanBase64 = base64.replace(/\s/g, "");
  const padding = cleanBase64.endsWith("==")
    ? 2
    : cleanBase64.endsWith("=")
      ? 1
      : 0;

  return Math.floor((cleanBase64.length * 3) / 4) - padding;
}

function isPdfBase64(base64) {
  try {
    const prefix = atob(base64.slice(0, 16));
    return prefix.startsWith("%PDF-");
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = new Set([
      "https://madanalbena.com",
      "https://www.madanalbena.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]);

    const corsOrigin = allowedOrigins.has(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      if (!corsOrigin) {
        return new Response(null, { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": corsOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "madan-project-study" });
    }

    if (url.pathname !== "/submit" || request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, 404, corsOrigin);
    }

    if (!env.RESEND_API_KEY) {
      return json({ ok: false, error: "Email service is not configured" }, 500, corsOrigin);
    }

    if (!env.NOTIFICATION_FROM_EMAIL) {
      return json({ ok: false, error: "Sender email is not configured" }, 500, corsOrigin);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400, corsOrigin);
    }

    const name = clean(body.name, 120);
    const phone = clean(body.phone, 20);
    const email = clean(body.email, 160);
    const city = clean(body.city, 120);
    const finishLevel = clean(body.finishLevel, 30);
    const notes = clean(body.notes, 3000);
    const floors = Number(body.floors);
    const files = Array.isArray(body.files) ? body.files : [];
    const billOfQuantities = body.billOfQuantities || null;

    if (name.length < 2) {
      return json({ ok: false, error: "الاسم غير صحيح" }, 400, corsOrigin);
    }

    if (!/^05\d{8}$/.test(phone)) {
      return json({ ok: false, error: "رقم الجوال غير صحيح" }, 400, corsOrigin);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "البريد الإلكتروني غير صحيح" }, 400, corsOrigin);
    }

    if (!city) {
      return json({ ok: false, error: "مدينة المشروع مطلوبة" }, 400, corsOrigin);
    }

    if (!Number.isInteger(floors) || floors < 1 || floors > 100) {
      return json({ ok: false, error: "عدد الأدوار غير صحيح" }, 400, corsOrigin);
    }

    if (!ALLOWED_FINISH_LEVELS.has(finishLevel)) {
      return json({ ok: false, error: "مستوى التشطيب غير صحيح" }, 400, corsOrigin);
    }

    if (files.length === 0) {
      return json({ ok: false, error: "مخططات المشروع مطلوبة" }, 400, corsOrigin);
    }

    if (files.length > MAX_FILES) {
      return json({ ok: false, error: "الحد الأقصى 5 مخططات" }, 400, corsOrigin);
    }

    let totalBytes = 0;
    const attachments = [];

    for (const file of files) {
      const filename = clean(file?.name, 180);
      const type = clean(file?.type, 100);
      const content = String(file?.content ?? "")
        .replace(/^data:application\/pdf;base64,/i, "")
        .replace(/\s/g, "");

      if (!filename || !filename.toLowerCase().endsWith(".pdf")) {
        return json({ ok: false, error: "يسمح بملفات PDF فقط" }, 400, corsOrigin);
      }

      if (type && type !== "application/pdf") {
        return json({ ok: false, error: "يسمح بملفات PDF فقط" }, 400, corsOrigin);
      }

      if (!content || !isPdfBase64(content)) {
        return json({ ok: false, error: "أحد ملفات PDF غير صالح" }, 400, corsOrigin);
      }

      const bytes = decodeBase64Size(content);

      if (bytes <= 0 || bytes > MAX_FILE_BYTES) {
        return json({ ok: false, error: "حجم الملف الواحد يجب ألا يتجاوز 8MB" }, 400, corsOrigin);
      }

      totalBytes += bytes;

      if (totalBytes > MAX_TOTAL_BYTES) {
        return json({ ok: false, error: "إجمالي المرفقات يجب ألا يتجاوز 20MB" }, 400, corsOrigin);
      }

      attachments.push({
        filename,
        content,
      });
    }

    if (billOfQuantities) {
      const filename = clean(
        billOfQuantities?.name || "جدول-الكميات.pdf",
        180
      );

      const type = clean(billOfQuantities?.type, 100);

      const content = String(billOfQuantities?.content ?? "")
        .replace(/^data:application\/pdf;base64,/i, "")
        .replace(/\s/g, "");

      if (!filename.toLowerCase().endsWith(".pdf")) {
        return json(
          { ok: false, error: "جدول الكميات يجب أن يكون بصيغة PDF" },
          400,
          origin
        );
      }

      if (type && type !== "application/pdf") {
        return json(
          { ok: false, error: "جدول الكميات يجب أن يكون بصيغة PDF" },
          400,
          origin
        );
      }

      if (!content || !isPdfBase64(content)) {
        return json(
          { ok: false, error: "جدول الكميات غير صالح" },
          400,
          origin
        );
      }

      const bytes = decodeBase64Size(content);

      if (bytes <= 0 || bytes > MAX_FILE_BYTES) {
        return json(
          { ok: false, error: "يجب ألا يتجاوز جدول الكميات 8MB" },
          400,
          origin
        );
      }

      if (totalBytes + bytes > MAX_TOTAL_BYTES) {
        return json(
          { ok: false, error: "إجمالي المرفقات يجب ألا يتجاوز 20MB" },
          400,
          origin
        );
      }

      attachments.push({
        filename,
        content,
      });

      totalBytes += bytes;
    }

    const recipient =
      env.PROJECT_STUDY_RECIPIENT || "operations@madanalbena.com";

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111">
        <h2>طلب دراسة مشروع جديد</h2>
        <p><strong>الاسم:</strong> ${escapeHtml(name)}</p>
        <p><strong>رقم الجوال:</strong> ${escapeHtml(phone)}</p>
        <p><strong>البريد الإلكتروني:</strong> ${escapeHtml(email || "غير مضاف")}</p>
        <p><strong>مدينة المشروع:</strong> ${escapeHtml(city)}</p>
        <p><strong>عدد الأدوار:</strong> ${floors}</p>
        <p><strong>مستوى التشطيب:</strong> ${escapeHtml(finishLevel)}</p>
        <p><strong>الملاحظات:</strong><br>${escapeHtml(notes || "لا توجد").replaceAll("\n", "<br>")}</p>
        <p><strong>عدد المخططات المرفقة:</strong> ${attachments.length}</p>
      </div>
    `;

    const emailPayload = {
      from: env.NOTIFICATION_FROM_EMAIL,
      to: [recipient],
      subject: "طلب دراسة مشروع جديد",
      html,
      attachments,
    };

    if (email) {
      emailPayload.reply_to = email;
    }

    let resendResponse;

    try {
      resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });
    } catch {
      return json({ ok: false, error: "تعذر الاتصال بخدمة البريد" }, 502, corsOrigin);
    }

    if (!resendResponse.ok) {
      const detail = await resendResponse.text();
      console.error("Resend error:", resendResponse.status, detail);

      return json({ ok: false, error: "تعذر إرسال الطلب، حاول مرة أخرى" }, 502, corsOrigin);
    }

    const result = await resendResponse.json();

    return json(
      {
        ok: true,
        message: "تم استلام طلب دراسة مشروعك بنجاح",
        id: result.id || null,
      },
      200,
      origin
    );
  },
};
