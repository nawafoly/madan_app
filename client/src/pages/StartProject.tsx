import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "../_core/firebase";

type ProjectFile = {
  name: string;
  type: string;
  content: string;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));

    reader.readAsDataURL(file);
  });
}

export default function StartProject() {
  const [showForm, setShowForm] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [billOfQuantities, setBillOfQuantities] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [finishLevel, setFinishLevel] = useState("");
  const [finishLevelOpen, setFinishLevelOpen] = useState(false);
  const [floors, setFloors] = useState("1");

  const removeFile = (index: number) => {
    setFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
    setError("");
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;

    const incoming = Array.from(selected);

    if (incoming.some(file => file.type !== "application/pdf")) {
      setError("يسمح برفع ملفات PDF فقط.");
      return;
    }

    const nextFiles = [...files, ...incoming];

    if (nextFiles.length > MAX_FILES) {
      setError(`يمكن إرفاق ${MAX_FILES} ملفات كحد أقصى.`);
      return;
    }

    if (nextFiles.some(file => file.size > MAX_FILE_BYTES)) {
      setError("يجب ألا يتجاوز حجم الملف الواحد 8 MB.");
      return;
    }

    const totalBytes = nextFiles.reduce((sum, file) => sum + file.size, 0);

    if (totalBytes > MAX_TOTAL_BYTES) {
      setError("إجمالي حجم المرفقات يجب ألا يتجاوز 20 MB.");
      return;
    }

    setFiles(nextFiles);
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) return;

    if (files.length === 0) {
      setError("يرجى إرفاق مخططات المشروع قبل إرسال الطلب.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const form = new FormData(event.currentTarget);

      const encodedFiles: ProjectFile[] = await Promise.all(
        files.map(async file => ({
          name: file.name,
          type: file.type,
          content: await readFileAsDataUrl(file),
        }))
      );

      const encodedBillOfQuantities: ProjectFile | null = billOfQuantities
        ? {
            name: billOfQuantities.name,
            type: billOfQuantities.type,
            content: await readFileAsDataUrl(billOfQuantities),
          }
        : null;

      const submitProjectStudy = httpsCallable(
        firebaseFunctions,
        "submitProjectStudy"
      );

      await submitProjectStudy({
        name: String(form.get("name") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        city: String(form.get("city") || ""),
        floors: String(form.get("floors") || "1"),
        finishLevel: String(form.get("finishLevel") || ""),
        notes: String(form.get("notes") || ""),
        files: encodedFiles,
        billOfQuantities: encodedBillOfQuantities,
      });

      setSuccess(true);
      setFiles([]);
      setBillOfQuantities(null);
    } catch (submitError: any) {
      console.error("[project-study] submit failed", submitError);

      setError(
        submitError?.message
          ?.replace(/^Firebase:\s*/i, "")
          .replace(/\s*\(functions\/[^)]+\)\.?$/i, "") ||
          "تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      dir="rtl"
      className="relative h-[100svh] min-h-[520px] w-full overflow-hidden bg-black text-white"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/HOOM-HERO.png"
        aria-hidden="true"
      >
        <source src="/start-project.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

      <section className="relative z-10 flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <div className="w-screen bg-black/45 py-8 backdrop-blur-[2px] md:py-10">
          <div className="mx-auto flex max-w-5xl flex-col items-center px-6">
            <div className="mb-7 h-28 w-32 overflow-hidden md:h-32 md:w-36">
              <img
                src="/logo.png"
                alt="شعار معدن البناء"
                className="h-auto w-full -translate-y-[2%] scale-[1.85]"
                style={{ transformOrigin: "50% 0%" }}
              />
            </div>

            <div className="mb-6 h-px w-24 bg-[#C9A227]" />

            <p className="mb-3 text-sm font-medium tracking-[0.22em] text-white/75">
              معدن البناء للمقاولات العامة
            </p>

            <h1 className="max-w-4xl text-3xl font-bold leading-[1.25] sm:text-4xl md:text-6xl lg:text-7xl">
              مشروعك يبدأ من هنا
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-white/80 md:text-lg">
              شاركنا تفاصيل مشروعك ومخططاتك، وسيقوم فريقنا بدراسة الطلب
              والتواصل معك.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setSuccess(false);
            setError("");
          }}
          className="group mt-9 inline-flex min-h-14 items-center justify-center gap-3 rounded-sm border border-white/80 !bg-white px-8 text-base font-bold !text-neutral-950 transition duration-300 hover:!bg-transparent hover:!text-white"
        >
          ابدأ دراسة مشروعك
          <ArrowLeft
            size={19}
            className="transition-transform duration-300 group-hover:-translate-x-1"
          />
        </button>
      </section>

      <div className="absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-[11px] tracking-[0.18em] text-white/45">
        MADAN ALBENA
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center px-4 py-6 md:items-center md:py-10">
            <div className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-[#111]/95 shadow-2xl">
              <button
                type="button"
                onClick={() => !submitting && setShowForm(false)}
                className="absolute left-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>

              {success ? (
                <div className="flex min-h-[500px] flex-col items-center justify-center px-7 py-16 text-center">
                  <CheckCircle2 size={58} strokeWidth={1.4} />

                  <h2 className="mt-6 text-3xl font-bold">
                    تم استلام طلبك
                  </h2>

                  <p className="mt-4 max-w-xl leading-8 text-white/70">
                    شكرًا لك، تم استلام طلب دراسة مشروعك بنجاح.
                    <br />
                    سيقوم فريق العمليات بمراجعة البيانات والمخططات المرفقة
                    والتواصل معك في أقرب وقت.
                  </p>

                  <p className="mt-6 text-sm text-white/55">
                    للاستفسار والتواصل: +966 59 115 4944
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="mt-8 min-h-12 border border-white !bg-white px-7 font-bold !text-black"
                  >
                    إغلاق
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-6 pt-16 md:p-10">
                  <div className="mb-10 flex flex-col items-center text-center">
                    <div className="mb-4 h-24 w-28 overflow-hidden">
                      <img
                        src="/logo.png"
                        alt="شعار معدن البناء"
                        className="h-auto w-full -translate-y-[2%] scale-[1.85]"
                        style={{ transformOrigin: "50% 0%" }}
                      />
                    </div>

                    <p className="text-xs tracking-[0.22em] text-white/45">
                      MADAN ALBENA
                    </p>

                    <h2 className="mt-3 text-3xl font-bold">
                      دراسة المشروع
                    </h2>

                    <p className="mt-3 max-w-2xl leading-7 text-white/60">
                      أدخل بيانات المشروع وأرفق المخططات المتوفرة، وسيتولى
                      فريق العمليات مراجعة الطلب.
                    </p>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        الاسم *
                      </span>
                      <input
                        name="name"
                        required
                        maxLength={120}
                        placeholder="الاسم الكامل"
                        className="h-13 w-full rounded-md border border-white/15 !bg-white/5 px-4 !text-white outline-none placeholder:!text-white/30 focus:border-white/45"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        رقم الجوال *
                      </span>
                      <input
                        name="phone"
                        required
                        inputMode="tel"
                        pattern="05[0-9]{8}"
                        maxLength={10}
                        placeholder="05xxxxxxxx"
                        dir="ltr"
                        className="h-13 w-full rounded-md border border-white/15 !bg-white/5 px-4 text-right !text-white outline-none placeholder:!text-white/30 focus:border-white/45"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        البريد الإلكتروني
                      </span>
                      <input
                        name="email"
                        type="email"
                        maxLength={160}
                        placeholder="name@example.com"
                        dir="ltr"
                        className="h-13 w-full rounded-md border border-white/15 !bg-white/5 px-4 text-right !text-white outline-none placeholder:!text-white/30 focus:border-white/45"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        مدينة المشروع *
                      </span>
                      <input
                        name="city"
                        required
                        maxLength={100}
                        placeholder="مثال: الرياض"
                        className="h-13 w-full rounded-md border border-white/15 !bg-white/5 px-4 !text-white outline-none placeholder:!text-white/30 focus:border-white/45"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        عدد الأدوار
                      </span>
                      <input
                        name="floors"
                        type="text"
                        pattern="[0-9]{1,3}"
                        maxLength={3}
                        value={floors}
                        onChange={event => {
                          const value = event.target.value.replace(/[^\d]/g, "");
                          setFloors(value);
                        }}
                        lang="en-US"
                        dir="ltr"
                        inputMode="numeric"
                        className="h-13 w-full rounded-md border border-white/15 !bg-white/5 px-4 !text-center !text-white outline-none focus:border-white/45"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm text-white/70">
                        مستوى التشطيب *
                      </span>
                      <div className="relative">
                        <input type="hidden" name="finishLevel" value={finishLevel} />

                        <button
                          type="button"
                          onClick={() => setFinishLevelOpen(open => !open)}
                          className={`flex h-13 w-full items-center justify-between rounded-md border px-4 text-right outline-none transition ${
                            finishLevelOpen
                              ? "border-white/40 bg-white/[0.08]"
                              : "border-white/15 bg-white/[0.05] hover:border-white/25"
                          }`}
                        >
                          <span className={finishLevel ? "text-white" : "text-white/45"}>
                            {finishLevel || "اختر مستوى التشطيب"}
                          </span>

                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            className={`shrink-0 text-white/50 transition-transform duration-200 ${
                              finishLevelOpen ? "rotate-180" : ""
                            }`}
                          >
                            <path
                              d="m6 9 6 6 6-6"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>

                        {finishLevelOpen && (
                          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-md border border-white/15 bg-[#181818] p-1 shadow-2xl">
                            {["اقتصادي", "متوسط", "فاخر"].map(level => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => {
                                  setFinishLevel(level);
                                  setFinishLevelOpen(false);
                                }}
                                className={`flex w-full items-center rounded px-4 py-3 text-right text-sm transition ${
                                  finishLevel === level
                                    ? "bg-white/10 text-white"
                                    : "text-white/80 hover:bg-white/[0.07] hover:text-white"
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>

                  <label className="mt-5 block">
                    <span className="mb-2 block text-sm text-white/70">
                      ملاحظات المشروع
                    </span>
                    <textarea
                      name="notes"
                      maxLength={3000}
                      rows={4}
                      placeholder="أي تفاصيل تساعد فريقنا على دراسة المشروع"
                      className="w-full resize-none rounded-md border border-white/15 !bg-white/5 p-4 !text-white outline-none placeholder:!text-white/30 focus:border-white/45"
                    />
                  </label>

                  <div className="mt-5">
                    <span className="mb-2 block text-sm text-white/70">
                      مخططات المشروع (PDF) *
                    </span>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-white/[0.03] px-5 py-7 text-center transition hover:border-white/40 hover:bg-white/[0.05]">
                      <Upload size={24} />

                      <span className="mt-3 font-medium">
                        اختر مخططات المشروع
                      </span>

                      <span className="mt-1 text-xs leading-6 text-white/40">
                        يمكن إرفاق أكثر من مخطط بصيغة PDF
                        <br />
                        حتى 5 ملفات — 8 MB للملف الواحد
                      </span>

                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        className="hidden"
                        onChange={event => {
                          handleFiles(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>

                    {files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {files.map((file, index) => (
                          <div
                            key={`${file.name}-${file.size}-${index}`}
                            className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3"
                          >
                            <FileText
                              size={18}
                              className="shrink-0 text-white/60"
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{file.name}</p>
                              <p className="mt-0.5 text-xs text-white/35">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFile(index)}
                              className="text-white/45 transition hover:text-white"
                              aria-label={`حذف ${file.name}`}
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <span className="mb-2 block text-sm text-white/70">
                      جدول الكميات (اختياري)
                    </span>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-white/[0.03] px-5 py-6 text-center transition hover:border-white/40 hover:bg-white/[0.05]">
                      <Upload size={22} />

                      <span className="mt-3 font-medium">
                        أرفق جدول الكميات
                      </span>

                      <span className="mt-1 text-xs leading-6 text-white/40">
                        ملف PDF واحد — حتى 8 MB
                      </span>

                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={event => {
                          const file = event.target.files?.[0] || null;

                          if (!file) return;

                          if (file.type !== "application/pdf") {
                            setError("جدول الكميات يجب أن يكون بصيغة PDF.");
                            event.target.value = "";
                            return;
                          }

                          if (file.size > MAX_FILE_BYTES) {
                            setError("يجب ألا يتجاوز حجم جدول الكميات 8 MB.");
                            event.target.value = "";
                            return;
                          }

                          setBillOfQuantities(file);
                          setError("");
                          event.target.value = "";
                        }}
                      />
                    </label>

                    {billOfQuantities && (
                      <div className="mt-3 flex items-center gap-3 rounded-md border border-white/10 bg-white/5 px-4 py-3">
                        <FileText
                          size={18}
                          className="shrink-0 text-white/60"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {billOfQuantities.name}
                          </p>
                          <p className="mt-0.5 text-xs text-white/35">
                            {(billOfQuantities.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setBillOfQuantities(null);
                            setError("");
                          }}
                          className="text-white/45 transition hover:text-white"
                          aria-label={`حذف ${billOfQuantities.name}`}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mt-5 rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-sm border border-white !bg-white px-7 font-bold !text-black transition hover:!bg-transparent hover:!text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={19} className="animate-spin" />
                        جاري إرسال الطلب...
                      </>
                    ) : (
                      <>
                        أرسل مشروعي للدراسة
                        <ArrowLeft size={19} />
                      </>
                    )}
                  </button>

                  <p className="mt-4 text-center text-xs leading-6 text-white/35">
                    سيتم إرسال بياناتك ومخططات المشروع مباشرة إلى فريق
                    العمليات.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
