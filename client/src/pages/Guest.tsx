// client/src/pages/Guest.tsx
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function GuestPage() {
  const [, setLocation] = useLocation();
  const { user, loading, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 mt-24">
        <div className="container max-w-xl">
          <Card>
            <CardContent className="py-10 space-y-6 text-center">
              <h1 className="text-2xl font-bold">صفحة الزائر</h1>

              <p className="text-muted-foreground leading-relaxed">
                أنت الآن داخل كزائر. تقدر تتصفح المشاريع العامة فقط.
                <br />
                إذا تبغى لوحة تحكم أو حساب عميل، لازم تسجل دخول.
              </p>

              <div className="grid gap-3">
                <Button onClick={() => setLocation("/login")}>تسجيل الدخول</Button>

                <Button
                  variant="outline"
                  onClick={async () => {
                    await logout();
                    setLocation("/");
                  }}
                  disabled={loading}
                >
                  تسجيل الخروج
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                الحالة: {user ? "مسجل" : "غير مسجل"} / الدور: {user?.role ?? "—"}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
