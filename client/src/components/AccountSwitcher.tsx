// client/src/components/AccountSwitcher.tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { LogOut, User } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function AccountSwitcher() {
  const [open, setOpen] = useState(false);
  const { user, loading, logout } = useAuth();

  const roleLabel =
    user?.role === "owner"
      ? "مالك"
      : user?.role === "accountant"
      ? "محاسب"
      : user?.role === "staff"
      ? "موظف"
      : "مستخدم";

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("تم تسجيل الخروج");
      setOpen(false);
      window.location.href = "/login";
    } catch {
      toast.error("تعذر تسجيل الخروج");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-[#F2B705] text-[#F2B705] hover:bg-[#F2B705] hover:text-black"
        >
          <User className="h-4 w-4" />
          <span className="hidden md:inline">
            {loading ? "..." : user?.displayName || user?.email || "الحساب"}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>الحساب</DialogTitle>
          <DialogDescription>
            تسجيل الدخول في معدن الآن عبر Firebase Auth (إيميل + كلمة مرور) فقط.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">جاري التحميل...</div>
          ) : user ? (
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">
                    {user.displayName || "بدون اسم"}
                  </p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                  {roleLabel}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              ما فيه مستخدم مسجّل.{" "}
              <Link href="/login" className="underline font-semibold">
                روح لتسجيل الدخول
              </Link>
            </div>
          )}

          <div className="flex gap-2">
            {user && (
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="w-full gap-2"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
