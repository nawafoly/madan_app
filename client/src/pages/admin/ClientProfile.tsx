/* eslint-disable @typescript-eslint/no-unused-vars */
// client/src/pages/admin/ClientProfile.tsx
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowRight, RefreshCw, FileDown } from "lucide-react";
import { toast } from "sonner";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/_core/firebase";
import { recomputeInvestorAggregates } from "@/_core/recomputeInvestorAggregates";

type UserDoc = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  vipStatus?: "regular" | "vip";
  vipTier?: string;
  internalNotes?: string;
  createdAt?: any;

  // ✅ إذا كانت recomputeInvestorAggregates تحفظ أرقام داخل user
  totalInvested?: number;
  expectedProfitTotal?: number;
  profitToDate?: number;
  aggregatesUpdatedAt?: any;
};

type InvestmentDoc = {
  id: string;
  userId?: string;
  investorUid?: string;
  projectId?: string;
  amount?: number;
  approvedAmount?: number;
  estimatedReturn?: number;
  expectedProfit?: number;
  status?: string;
  createdAt?: any;
  startAt?: any;
  plannedEndAt?: any;
};

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") return new Date(v);
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    return null;
  } catch {
    return null;
  }
}

const pick = (...vals: any[]) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
};

function projectName(projectId: any, projectsMap: Record<string, any>) {
  const pid = String(projectId || "");
  if (!pid) return "—";
  const p = projectsMap[pid];
  if (!p) return "—";
  return pick(p?.titleAr, p?.nameAr, p?.title, p?.name) || "—";
}

/**
 * ✅ تعديل 1: النسبة من الحقل الحقيقي عندك (annualReturn)
 * - أول شيء نحاول: annualReturn
 * - وباقي التخمينات نخليها احتياط
 */
function projectProfitPercent(projectId: any, projectsMap: Record<string, any>) {
  const pid = String(projectId || "");
  if (!pid) return null;
  const p = projectsMap[pid];
  if (!p) return null;

  const v =
    p?.annualReturn ??
    p?.profitPercent ??
    p?.profitRate ??
    p?.roiPercent ??
    p?.returnPercent;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ✅ تعديل 2: حساب يوم الاستحقاق إذا plannedEndAt غير موجود
 * - نعتمد على مدة المشروع داخل projects:
 *   durationMonths أو duration أو durationInMonths (احتياط)
 */
function projectDurationMonths(projectId: any, projectsMap: Record<string, any>) {
  const pid = String(projectId || "");
  if (!pid) return null;
  const p = projectsMap[pid];
  if (!p) return null;

  const v = p?.durationMonths ?? p?.duration ?? p?.durationInMonths;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("ar-SA") : "—";
}

function money(v: any) {
  const n = Number(v);
  const x = Number.isFinite(n) ? n : 0;
  return `${Math.round(x).toLocaleString("ar-SA")} ر.س`;
}

function statusLabel(s: any) {
  const v = String(s || "").toLowerCase();
  if (!v) return "—";
  const map: Record<string, string> = {
    active: "نشط",
    completed: "منتهي",
    closed: "مقفل",
    pending: "قيد الانتظار",
    approved: "مقبول",
    rejected: "مرفوض",
    signing: "قيد الإجراء",
    signed: "تمت الموافقة",

    // ✅ إضافة حالات عندك بالصورة (اختياري بس مفيد)
    pending_review: "بانتظار المراجعة",
    pending_contract: "بانتظار العقد",
  };
  return map[v] || String(s || "—");
}

/**
 * ✅ تعديل 3: ملخص (مستمر / منتهي)
 */
function investmentSummary(status: any) {
  const s = String(status || "").toLowerCase();
  const ended = s.includes("completed") || s.includes("closed");
  return ended ? "منتهي" : "مستمر";
}

export default function ClientProfile() {
  const userId = new URLSearchParams(window.location.search).get("id") || "";

  const [user, setUser] = useState<UserDoc | null>(null);
  const [investments, setInvestments] = useState<InvestmentDoc[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userId) {
      toast.error("معرف العميل غير موجود");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // ✅ تحديث حسابات العميل أول ما تفتح ملفه
      await recomputeInvestorAggregates(userId);

      // ✅ تحميل العميل
      const uSnap = await getDoc(doc(db, "users", userId));
      const u = uSnap.exists()
        ? ({ id: uSnap.id, ...(uSnap.data() as any) } as UserDoc)
        : null;

      // ✅ تحميل الاستثمارات (دعم userId أو investorUid)
      const invRef = collection(db, "investments");
      const s1 = await getDocs(query(invRef, where("userId", "==", userId)));
      let invDocs = s1.docs;

      if (invDocs.length === 0) {
        const s2 = await getDocs(
          query(invRef, where("investorUid", "==", userId))
        );
        invDocs = s2.docs;
      }

      const invRows = invDocs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      // ✅ تحميل المشاريع (عشان نعرض "اسم المشروع" + "النسبة" في الملف)
      const pSnap = await getDocs(collection(db, "projects"));
      const pMap: Record<string, any> = {};
      pSnap.docs.forEach(
        (d) => (pMap[d.id] = { id: d.id, ...(d.data() as any) })
      );

      setProjectsMap(pMap);
      setUser(u);
      setInvestments(invRows);
      setLoading(false);
    } catch (e) {
      console.error(e);
      toast.error("تعذر تحميل ملف العميل");
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const totalInvested = useMemo(() => {
    if (typeof user?.totalInvested === "number") return user.totalInvested;
    return investments.reduce(
      (s, i) => s + Number(i.approvedAmount ?? i.amount ?? 0),
      0
    );
  }, [user?.totalInvested, investments]);

  const expectedProfitTotal = useMemo(() => {
    if (typeof user?.expectedProfitTotal === "number")
      return user.expectedProfitTotal;
    return investments.reduce(
      (s, i) => s + Number(i.expectedProfit ?? i.estimatedReturn ?? 0),
      0
    );
  }, [user?.expectedProfitTotal, investments]);

  const profitToDate = useMemo(() => {
    if (typeof user?.profitToDate === "number") return user.profitToDate;
    return 0;
  }, [user?.profitToDate]);

  const downloadClientReportPdf = () => {
    if (!user) return;

    const createdAt = toDateSafe(user.createdAt);
    const reportDate = new Date().toLocaleString("ar-SA");

    const rowsHtml = investments
      .map((inv, idx) => {
        const start = toDateSafe(inv.startAt) || toDateSafe(inv.createdAt);

        // ✅ تعديل 2: الاستحقاق = plannedEndAt أو محسوب من مدة المشروع
        const endDirect = toDateSafe(inv.plannedEndAt);
        const months = projectDurationMonths(inv.projectId, projectsMap);
        const endComputed =
          !endDirect && start && months ? addMonths(start, months) : null;
        const end = endDirect || endComputed;

        const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
        const exp = Number(inv.expectedProfit ?? inv.estimatedReturn ?? 0);

        const pName = projectName(inv.projectId, projectsMap);
        const pct = projectProfitPercent(inv.projectId, projectsMap);
        const total = amount + exp;

        const st = String(inv.status || "").toLowerCase();
        const isEnded = st.includes("completed") || st.includes("closed");

        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${pName}</td>
            <td>${statusLabel(inv.status)}</td>
            <td>${money(amount)}</td>
            <td>${pct == null ? "—" : pct + "%"}</td>
            <td>${money(exp)}</td>
            <td><b>${money(total)}</b></td>
            <td>${fmtDate(start)}</td>
            <td>${fmtDate(end)}</td>
            <td style="color:${isEnded ? "#047857" : "#334155"}; font-weight:700;">
              ${isEnded ? "منتهي" : "مستمر"}
            </td>
          </tr>
        `;
      })
      .join("");

    const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقرير العميل</title>
        <style>
          body { font-family: Arial, "Tahoma", sans-serif; margin: 24px; color:#0f172a; }
          .hdr { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
          .box { border:1px solid #e2e8f0; border-radius:12px; padding:14px; }
          h1 { margin:0 0 6px 0; font-size:22px; }
          .muted { color:#64748b; font-size:12px; }
          .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:12px; }
          .k { color:#64748b; font-size:12px; margin-bottom:4px; }
          .v { font-weight:700; }
          table { width:100%; border-collapse:collapse; margin-top:14px; }
          th, td { border:1px solid #e2e8f0; padding:10px; font-size:12px; vertical-align:top; }
          th { background:#f8fafc; }
          .sum { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-top:12px; }
          .sum .v { font-size:16px; }
          @media print {
            button { display:none; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="hdr">
          <div>
            <h1>تقرير العميل</h1>
            <div class="muted">تاريخ التقرير: ${reportDate}</div>
          </div>
          <div>
            <button onclick="window.print()" style="padding:10px 14px;border:0;border-radius:10px;background:#111827;color:#fff;cursor:pointer;">
              طباعة / حفظ PDF
            </button>
          </div>
        </div>

        <div class="grid">
          <div class="box">
            <div class="k">الاسم</div>
            <div class="v">${user.name || "—"}</div>
            <div class="k" style="margin-top:10px;">البريد</div>
            <div class="v">${user.email || "—"}</div>
            <div class="k" style="margin-top:10px;">تاريخ إنشاء الحساب</div>
            <div class="v">${fmtDate(createdAt)}</div>
          </div>

          <div class="box">
            <div class="k">نوع الحساب</div>
            <div class="v">${user.role || "—"}</div>

            <div class="k" style="margin-top:10px;">الحالة</div>
            <div class="v">${
              user.vipStatus === "vip"
                ? `VIP ${user.vipTier ? `- ${user.vipTier}` : ""}`
                : "عادي"
            }</div>
          </div>
        </div>

        <div class="sum">
          <div class="box">
            <div class="k">إجمالي الاستثمار</div>
            <div class="v">${money(totalInvested)}</div>
          </div>
          <div class="box">
            <div class="k">الربح حتى اليوم</div>
            <div class="v">${money(profitToDate)}</div>
          </div>
          <div class="box">
            <div class="k">العائد المتوقع</div>
            <div class="v">${money(expectedProfitTotal)}</div>
          </div>
          <div class="box">
            <div class="k">عدد الاستثمارات</div>
            <div class="v">${investments.length}</div>
          </div>
        </div>

        <div class="box" style="margin-top:12px;">
          <div class="k">ملاحظات داخلية</div>
          <div class="v" style="font-weight:600; white-space:pre-wrap;">${
            user.internalNotes || "—"
          }</div>
        </div>

        <div class="box" style="margin-top:12px;">
          <div class="k" style="font-weight:700;">تفاصيل الاستثمارات</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم المشروع</th>
                <th>الحالة</th>
                <th>المبلغ</th>
                <th>النسبة</th>
                <th>الربح</th>
                <th>الإجمالي</th>
                <th>تاريخ الدخول</th>
                <th>يوم الاستحقاق</th>
                <th>ملخص</th>
              </tr>
            </thead>
            <tbody>
              ${
                rowsHtml ||
                `<tr><td colspan="10" style="text-align:center;color:#64748b;">لا توجد استثمارات</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </body>
    </html>
    `;

    const w = window.open("", "_blank");
    if (!w) {
      toast.error("المتصفح منع فتح نافذة التقرير. فعّل popups للموقع.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowRight className="w-4 h-4 ml-1" />
              رجوع
            </Button>

            <div>
              <h1 className="text-3xl font-bold">ملف العميل</h1>
              <p className="text-muted-foreground">
                عرض الهيستوري والملخص المالي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw className="w-4 h-4 ml-1" />
              تحديث
            </Button>

            <Button onClick={downloadClientReportPdf}>
              <FileDown className="w-4 h-4 ml-1" />
              تحميل PDF
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : !user ? (
          <div className="text-center py-12 text-muted-foreground">
            العميل غير موجود
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الاسم</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-bold">{user.name || "—"}</div>
                  <div className="text-sm text-muted-foreground">
                    {user.email || "—"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الحالة</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{user.role || "—"}</Badge>
                  <div className="mt-2">
                    {user.vipStatus === "vip" ? (
                      <Badge className="bg-accent">
                        VIP {user.vipTier ? `- ${user.vipTier}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline">عادي</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">إجمالي الاستثمار</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Number(totalInvested).toLocaleString("ar-SA")} ر.س
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">الربح حتى اليوم</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(Number(profitToDate)).toLocaleString("ar-SA")}{" "}
                    ر.س
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    العائد المتوقع:{" "}
                    {Math.round(Number(expectedProfitTotal)).toLocaleString(
                      "ar-SA"
                    )}{" "}
                    ر.س
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Investments */}
            <Card>
              <CardHeader>
                <CardTitle>هيستوري الاستثمارات</CardTitle>
              </CardHeader>
              <CardContent>
                {investments.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    لا توجد استثمارات لهذا العميل
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>اسم المشروع</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>النسبة</TableHead>
                        <TableHead>الربح</TableHead>
                        <TableHead>الإجمالي</TableHead>
                        <TableHead>تاريخ الدخول</TableHead>
                        <TableHead>يوم الاستحقاق</TableHead>
                        {/* ✅ تعديل 3: إضافة عمود الملخص */}
                        <TableHead>ملخص</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {investments.map((inv) => {
                        const start =
                          toDateSafe(inv.startAt) || toDateSafe(inv.createdAt);

                        // ✅ تعديل 2: الاستحقاق = plannedEndAt أو محسوب من مدة المشروع
                        const endDirect = toDateSafe(inv.plannedEndAt);
                        const months = projectDurationMonths(inv.projectId, projectsMap);
                        const endComputed =
                          !endDirect && start && months
                            ? addMonths(start, months)
                            : null;
                        const end = endDirect || endComputed;

                        const amount = Number(inv.approvedAmount ?? inv.amount ?? 0);
                        const exp = Number(inv.expectedProfit ?? inv.estimatedReturn ?? 0);
                        const total = amount + exp;

                        const pName = projectName(inv.projectId, projectsMap);
                        const pct = projectProfitPercent(inv.projectId, projectsMap);

                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="font-semibold">{pName}</TableCell>

                            <TableCell>
                              <Badge variant="outline">{statusLabel(inv.status)}</Badge>
                            </TableCell>

                            <TableCell className="font-bold">
                              {amount.toLocaleString("ar-SA")} ر.س
                            </TableCell>

                            <TableCell>{pct == null ? "—" : `${pct}%`}</TableCell>

                            <TableCell>{exp.toLocaleString("ar-SA")} ر.س</TableCell>

                            <TableCell className="font-bold">
                              {Math.round(total).toLocaleString("ar-SA")} ر.س
                            </TableCell>

                            <TableCell>
                              {start ? start.toLocaleDateString("ar-SA") : "-"}
                            </TableCell>

                            <TableCell>
                              {end ? end.toLocaleDateString("ar-SA") : "-"}
                            </TableCell>

                            {/* ✅ تعديل 3: قيمة الملخص */}
                            <TableCell>
                              <Badge variant="outline">{investmentSummary(inv.status)}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>ّ
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
