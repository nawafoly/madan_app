import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { languageDir, tr } from "@/lib/i18n";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { language } = useLanguage();

  return (
    <div
      dir={languageDir(language)}
      className="min-h-screen w-full flex items-center justify-center bg-transparent"
    >
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>

          <h2 className="text-xl font-semibold text-slate-700 mb-4">
            {tr(language, "الصفحة غير موجودة", "Page Not Found")}
          </h2>

          <p className="text-slate-600 mb-8 leading-relaxed">
            {tr(
              language,
              "الصفحة التي تحاول الوصول إليها غير متوفرة.",
              "The page you are trying to reach is unavailable."
            )}
            <br />
            {tr(language, "ربما تم نقلها أو حذفها.", "It may have been moved or deleted.")}
          </p>

          <div className="flex justify-center">
            <Button
              onClick={() => setLocation("/")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-md"
            >
              <Home className="w-4 h-4 ml-2" />
              {tr(language, "العودة للرئيسية", "Back Home")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
