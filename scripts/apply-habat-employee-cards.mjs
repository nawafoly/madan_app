import fs from "node:fs";

const path = "client/src/pages/habat/HabatAttendanceAppV4.tsx";
let text = fs.readFileSync(path, "utf8");

const start = text.indexOf("function EmployeesPage({ onOpenEmployee }");
const end = text.indexOf("\nfunction ManagerRecordsPage()", start);
if (start < 0 || end < 0) throw new Error("employee_page_anchor_missing");

const replacement = `function EmployeesPage({ onOpenEmployee }: { onOpenEmployee: (account: HabatAccessAccount) => void }) {
  const [accounts, setAccounts] = useState<HabatAccessAccount[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const payload = await habatApi<{ ok: true; accounts: HabatAccessAccount[] }>("access");
      setAccounts(payload.accounts || []);
    } catch (caught) { setError(extendedError(caught)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeAccounts = accounts.filter(account => account.isActive);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">الموظفون</h2>
            <p className="mt-1 text-sm text-slate-500">اختر الموظف لفتح ملفه الكامل وإدارة الدوام والحضور والإجازات والراتب.</p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      </section>

      {activeAccounts.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeAccounts.map(account => (
            <button
              key={account.id}
              type="button"
              onClick={() => onOpenEmployee(account)}
              className="group min-h-[190px] rounded-[28px] border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-slate-950">{account.displayName || account.email}</h3>
                  <p className="mt-1 truncate text-xs text-slate-500" dir="ltr">{account.email}</p>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white transition group-hover:scale-105">
                  <UserRound className="h-6 w-6" />
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">الصلاحية</p>
                  <p className="mt-1 font-black">{account.accessLevel === "manager" ? "إدارة" : "موظف"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">البصمة</p>
                  <p className="mt-1 font-black">{account.clockEnabled ? "مفعلة" : "غير مفعلة"}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm font-black">
                <span>فتح ملف الموظف</span>
                <ChevronLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
              </div>
            </button>
          ))}
        </section>
      ) : (
        <section className="rounded-[28px] border border-slate-200 bg-white py-14 text-center text-sm text-slate-500">
          لا توجد حسابات موظفين مفعلة.
        </section>
      )}
    </div>
  );
}
`;

text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(path, text);
console.log("PASS - Habbat employee list converted to clickable employee cards.");
