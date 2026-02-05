// client/src/App.tsx
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import ScrollToTop from "@/components/ScrollToTop";
import SiteLayout from "@/components/SiteLayout";

import Home from "./pages/Home";
import ProjectsPage from "./pages/Projects";
import About from "./pages/About";
import Contact from "./pages/Contact";
import ProjectDetails from "./pages/ProjectDetails";

import LoginPage from "./pages/Login";
import RequireRole from "./components/RequireRole";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import ProjectsManagement from "./pages/admin/ProjectsAdmin";
import CreateProject from "@/pages/admin/CreateProject";
import EditProject from "@/pages/admin/EditProject";
import Reports from "@/pages/admin/Reports";
import Settings from "@/pages/admin/Settings";
import FinancialManagement from "./pages/admin/Financial";
import ClientsManagement from "./pages/admin/Clients";
import MessagesManagement from "./pages/admin/Messages";
import AuditLogPage from "./pages/admin/AuditLog";
import DebugAuthPage from "./pages/admin/DebugAuth";
import Vip from "./pages/admin/Vip";

// ✅ Client pages
import ClientDashboard from "@/pages/client/MyInvestments";
import ClientContractDetails from "@/pages/client/ContractDetails";
import InvestmentDetails from "@/pages/client/InvestmentDetails";

function Router() {
  return (
    <>
      {/* ✅ Global scroll to top on route change */}
      <ScrollToTop />

      <Switch>
        {/* ================= Public (ثابت في كل صفحة) ================= */}
        <Route path="/">
          <SiteLayout>
            <Home />
          </SiteLayout>
        </Route>

        <Route path="/projects">
          <SiteLayout>
            <ProjectsPage />
          </SiteLayout>
        </Route>

        <Route path="/projects/:id">
          <SiteLayout>
            <ProjectDetails />
          </SiteLayout>
        </Route>

        <Route path="/about">
          <SiteLayout>
            <About />
          </SiteLayout>
        </Route>

        <Route path="/contact">
          <SiteLayout>
            <Contact />
          </SiteLayout>
        </Route>

        {/* ================= Auth (برضو نبي الثابت) ================= */}
        <Route path="/login">
          <SiteLayout>
            <LoginPage />
          </SiteLayout>
        </Route>

        <Route path="/404" component={NotFound} />

        {/* ================= Admin Dashboard ================= */}
        <Route path="/dashboard">
          <RequireRole allow={["owner", "admin", "accountant", "staff"]}>
            <AdminDashboard />
          </RequireRole>
        </Route>

        {/* ===== Admin: Projects ===== */}
        <Route path="/admin/projects">
          <RequireRole allow={["owner", "admin"]}>
            <ProjectsManagement />
          </RequireRole>
        </Route>

        <Route path="/admin/projects/create">
          <RequireRole allow={["owner", "admin"]}>
            <CreateProject />
          </RequireRole>
        </Route>

        <Route path="/admin/projects/:id/edit">
          <RequireRole allow={["owner", "admin"]}>
            <EditProject />
          </RequireRole>
        </Route>

        {/* ===== Admin: Reports ===== */}
        <Route path="/admin/reports">
          <RequireRole allow={["owner", "admin", "accountant"]}>
            <Reports />
          </RequireRole>
        </Route>

        {/* ===== Admin: Financial ===== */}
        <Route path="/admin/financial">
          <RequireRole allow={["owner", "accountant"]}>
            <FinancialManagement />
          </RequireRole>
        </Route>

        {/* ===== Admin: Clients ===== */}
        <Route path="/admin/clients">
          <RequireRole allow={["owner", "admin"]}>
            <ClientsManagement />
          </RequireRole>
        </Route>

        {/* ===== Admin: VIP ===== */}
        <Route path="/admin/vip">
          <RequireRole allow={["owner", "admin"]}>
            <Vip />
          </RequireRole>
        </Route>

        {/* ===== Admin: Messages ===== */}
        <Route path="/admin/messages">
          <RequireRole allow={["owner", "admin", "staff"]}>
            <MessagesManagement />
          </RequireRole>
        </Route>

        {/* ===== Admin: Settings ===== */}
        <Route path="/admin/settings">
          <RequireRole allow={["owner"]}>
            <Settings />
          </RequireRole>
        </Route>

        {/* ===== Admin: Audit Log ===== */}
        <Route path="/admin/audit-log">
          <RequireRole allow={["owner"]}>
            <AuditLogPage />
          </RequireRole>
        </Route>

        {/* ===== Debug (اختياري) ===== */}
        <Route path="/admin/debug-auth">
          <RequireRole allow={["owner"]}>
            <DebugAuthPage />
          </RequireRole>
        </Route>

        {/* ================= Client Area ================= */}

        {/* ✅ deep link لازم يسبق أي redirects عامة */}
        <Route path="/client/contracts/:id">
          <RequireRole allow={["client"]}>
            <ClientContractDetails />
          </RequireRole>
        </Route>

        {/* ✅ تفاصيل الاستثمار: للعميل فقط */}
        <Route path="/client/investments/:id">
          <RequireRole allow={["client"]}>
            <InvestmentDetails />
          </RequireRole>
        </Route>

        {/* ✅ صفحة العميل */}
        <Route path="/client/dashboard">
          <RequireRole allow={["client", "guest"]}>
            <ClientDashboard />
          </RequireRole>
        </Route>

        {/* ✅ Redirects */}
        <Route path="/client/investments">
          <Redirect to="/client/dashboard" />
        </Route>

        <Route path="/client/contracts">
          <Redirect to="/client/dashboard" />
        </Route>

        <Route path="/client">
          <Redirect to="/client/dashboard" />
        </Route>

        {/* ================= Fallback ================= */}
        <Route>
          <SiteLayout>
            <NotFound />
          </SiteLayout>
        </Route>
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider defaultLanguage="ar">
        <ThemeProvider defaultTheme="light">
          <div className="rsg-bg" aria-hidden="true" />
          <div className="relative z-10 min-h-screen">
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </div>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
