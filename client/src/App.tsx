// client/src/App.tsx
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import ScrollToTop from "@/components/ScrollToTop";
import SiteLayout from "@/components/SiteLayout";

import Home from "./pages/Home";
import ProjectsPage from "./pages/Projects";
import About from "./pages/About";
import Careers from "./pages/Careers";
import Contact from "./pages/Contact";
import ProjectDetails from "./pages/ProjectDetails";

import LoginPage from "./pages/Login";
import RequireRole from "./components/RequireRole";
import RequireAdminPermission from "./components/RequireAdminPermission";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import ProjectsManagement from "./pages/admin/ProjectsAdmin";
import CreateProject from "@/pages/admin/CreateProject";
import EditProject from "@/pages/admin/EditProject";
import Reports from "@/pages/admin/Reports";
import Settings from "@/pages/admin/Settings";
import FinancialManagement from "./pages/admin/Financial";
import ClientsManagement from "./pages/admin/Clients";
import ClientProfile from "@/pages/admin/ClientProfile";
import MessagesManagement from "./pages/admin/Messages";
import RecruitmentApplicationsPage from "./pages/admin/RecruitmentApplications";
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

        <Route path="/careers">
          <SiteLayout>
            <Careers />
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
          <RequireAdminPermission permission="dashboard.view">
            <AdminDashboard />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Projects ===== */}
        <Route path="/admin/projects">
          <RequireAdminPermission permission="projects.manage">
            <ProjectsManagement />
          </RequireAdminPermission>
        </Route>

        <Route path="/admin/projects/create">
          <RequireAdminPermission permission="projects.manage">
            <CreateProject />
          </RequireAdminPermission>
        </Route>

        <Route path="/admin/projects/:id/edit">
          <RequireAdminPermission permission="projects.manage">
            <EditProject />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Reports ===== */}
        <Route path="/admin/reports">
          <RequireAdminPermission permission="reports.view">
            <Reports />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Financial ===== */}
        <Route path="/admin/financial">
          <RequireAdminPermission permission="financial.view">
            <FinancialManagement />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Clients ===== */}
        <Route path="/admin/clients">
          <RequireAdminPermission permission="users.view">
            <ClientsManagement />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Client Profile ===== */}
        <Route path="/admin/client-profile">
          <RequireAdminPermission permission="users.view">
            <ClientProfile />
          </RequireAdminPermission>
        </Route>


        {/* ===== Admin: VIP ===== */}
        <Route path="/admin/vip">
          <RequireAdminPermission permission="users.manage">
            <Vip />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Messages ===== */}
        <Route path="/admin/messages/:requestId">
          <RequireAdminPermission permission="messages.view">
            <MessagesManagement />
          </RequireAdminPermission>
        </Route>

        <Route path="/admin/messages">
          <RequireAdminPermission permission="messages.view">
            <MessagesManagement />
          </RequireAdminPermission>
        </Route>

        <Route path="/admin/recruitment-applications">
          <RequireAdminPermission permission="messages.view">
            <RecruitmentApplicationsPage />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Settings ===== */}
        <Route path="/admin/settings">
          <RequireAdminPermission permission="settings.manage">
            <Settings />
          </RequireAdminPermission>
        </Route>

        {/* ===== Admin: Audit Log ===== */}
        <Route path="/admin/audit-log">
          <RequireAdminPermission permission="settings.manage">
            <AuditLogPage />
          </RequireAdminPermission>
        </Route>

        {/* ===== Debug (اختياري) ===== */}
        <Route path="/admin/debug-auth">
          <RequireAdminPermission permission="settings.manage">
            <DebugAuthPage />
          </RequireAdminPermission>
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
          <RequireRole allow={["client", "guest", "owner", "admin"]}>
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

          <TooltipProvider>
            {/* ✅ لازم يكون أعلى طبقة */}
            <Toaster
              position="top-center"
              style={{ zIndex: 99999 }}
              toastOptions={{
                className: "rsg-toast",
              }}
            />

            <div className="relative z-10 min-h-screen">
              <Router />
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
