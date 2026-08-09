const sections = [
  {
    title: "البيانات التي نعالجها",
    text: "قد نعالج بيانات الحساب والموظف، وبيانات الحضور والانصراف والإجازات والرواتب، والموقع الجغرافي عند تنفيذ الحضور أو الانصراف، وصور إثبات الحضور عند طلبها، وبيانات تقنية لازمة لتشغيل التطبيق وحمايته.",
  },
  {
    title: "أغراض استخدام البيانات",
    text: "نستخدم البيانات لتسجيل وإدارة الحضور والإجازات والرواتب، وتأمين الحسابات، وعرض السجلات للموظف وجهة عمله.",
  },
  {
    title: "مشاركة البيانات",
    text: "تتاح البيانات لجهة عمل المستخدم ولمسؤوليها المصرح لهم بحسب الصلاحيات، ولمزودي البنية التحتية اللازمين لتشغيل الخدمة وتأمينها. لا نبيع البيانات الشخصية.",
  },
  {
    title: "الاحتفاظ والأمان",
    text: "نحتفظ بالبيانات للمدة اللازمة لتشغيل الخدمة والوفاء بالالتزامات النظامية أو التعاقدية، ونطبق تدابير معقولة لحمايتها.",
  },
  {
    title: "التحكم في الأذونات والحقوق",
    text: "يمكن للمستخدم رفض إذن الموقع أو الكاميرا من إعدادات الجهاز، مع العلم أن بعض خصائص الحضور قد لا تعمل دونها. لطلب الوصول إلى البيانات أو تصحيحها أو حذفها، تواصل مع جهة العمل أو معنا.",
  },
];

export default function Privacy() {
  return (
    <section dir="rtl" className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
        <header className="bg-gradient-to-l from-[#866420] via-[#b48a3c] to-[#e2c778] px-7 py-10 text-white sm:px-12 sm:py-14">
          <p className="mb-3 text-sm font-semibold tracking-[0.24em] text-white/85">MAEDIN STAFF</p>
          <h1 className="text-3xl font-bold sm:text-4xl">سياسة الخصوصية</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/90">نوضح هنا كيفية تعامل منصة Maedin مع بيانات الموظفين عند استخدام خدمات الموارد البشرية والحضور والانصراف.</p>
          <p className="mt-5 text-sm text-white/80">آخر تحديث: 9 أغسطس 2026</p>
        </header>

        <div className="space-y-8 px-7 py-9 sm:px-12 sm:py-12">
          {sections.map((section, index) => (
            <article key={section.title} className="grid gap-3 border-b border-slate-100 pb-8 last:border-0 last:pb-0 sm:grid-cols-[44px_1fr]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f0df] text-sm font-bold text-[#8d6a20]">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
                <p className="mt-3 text-base leading-8 text-slate-600">{section.text}</p>
              </div>
            </article>
          ))}

          <div className="rounded-2xl bg-slate-50 p-6 text-slate-700">
            <h2 className="text-xl font-bold text-slate-900">التواصل</h2>
            <p className="mt-3 leading-8">لأي استفسار عن الخصوصية، تواصل معنا من خلال صفحة التواصل في موقع Maedin.</p>
            <a href="/contact" className="mt-4 inline-flex rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700">تواصل معنا</a>
          </div>
        </div>
      </div>
    </section>
  );
}
