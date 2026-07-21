# HR Core Cloudflare — Phase 6

هذه المرحلة تنقل سجلات الرواتب الشهرية من Firestore إلى Cloudflare D1 وتربط واجهتي الإدارة والموظف بها.

## النطاق

- جدول `employee_payroll_records` في قاعدة `maedin-hr`.
- صلاحيات `payroll.view` و`payroll.manage`.
- قراءة سجلات الرواتب من D1 في صفحة إدارة الموظفين وبوابة الموظف.
- إنشاء سجل نهاية الشهر في D1.
- احتساب الحضور من Worker الحضور الموجود على Cloudflare.
- إدخال الغياب المسجل في D1 ضمن احتساب الراتب.
- خصم السلف المعتمدة تلقائيًا وربطها بسجل الراتب لمنع خصمها مرتين.
- الاحتفاظ بمستند مدد في R2 وربط بياناته بسجل D1.
- أداة نقل سجلات `employee_payroll_records` القديمة من Firestore.

## مسارات API

- `GET /api/hr/payroll-records`
- `POST /api/hr/payroll-records`
- `GET /api/hr/payroll-advances`
- `POST /internal/hr/payroll/import`

## قواعد السلف

السلفة تدخل في سجل الراتب فقط عندما تكون من نوع `salary_advance` وحالتها `approved` ولم ترتبط سابقًا بسجل راتب. بعد إنشاء السجل تحفظ قيمة `payroll_record_id` و`payroll_month` ووقت التسوية على طلب السلفة.

## الانتقال المؤقت

Firebase Auth ما زال مستخدمًا مؤقتًا للتحقق من هوية المستخدم. بيانات الرواتب الجديدة وقراءتها تتم عبر Cloudflare D1 عند تفعيل `VITE_USE_HR_D1=true`.
