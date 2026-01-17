import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

import Home from "./pages/Home";
import ProjectsPage from "./pages/Projects";
import About from "./pages/About";
import Contact from "./pages/Contact";
import ProjectDetails from "./pages/ProjectDetails";

import LoginPage from "./pages/Login";
import RequireRole from "./components/RequireRole";

// Admin pages
import AdminDashboard from "./pages/admin/Dashboard";
import ProjectsManagement from "./pages/admin/Projects";
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

// Client pages
import ClientDashboard from "./pages/client/MyDashboard";
import MyInvestments from "./pages/client/MyInvestments";

// ✅ NEW: Contract page
import ClientContractDetails from "./pages/client/ContractDetails";

function Router() {
  return (
    <Switch>
      {/* ================= Public ================= */}
      <Route path={"/"} component={Home} />
      <Route path={"/projects"} component={ProjectsPage} />
      <Route path={"/projects/:id"} component={ProjectDetails} />
      <Route path={"/about"} component={About} />
      <Route path={"/contact"} component={Contact} />

      {/* ================= Auth ================= */}
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/404"} component={NotFound} />

      {/* ================= Admin Dashboard ================= */}
      <Route path={"/dashboard"}>
        <RequireRole allow={["owner", "admin", "accountant", "staff"]}>
          <AdminDashboard />
        </RequireRole>
      </Route>

      {/* ===== Admin: Projects ===== */}
      <Route path={"/admin/projects"}>
        <RequireRole allow={["owner", "admin"]}>
          <ProjectsManagement />
        </RequireRole>
      </Route>

      <Route path={"/admin/projects/create"}>
        <RequireRole allow={["owner", "admin"]}>
          <CreateProject />
        </RequireRole>
      </Route>

      <Route path={"/admin/projects/:id/edit"}>
        <RequireRole allow={["owner", "admin"]}>
          <EditProject />
        </RequireRole>
      </Route>

      {/* ===== Admin: Reports ===== */}
      <Route path={"/admin/reports"}>
        <RequireRole allow={["owner", "admin", "accountant"]}>
          <Reports />
        </RequireRole>
      </Route>

      {/* ===== Admin: Financial ===== */}
      <Route path={"/admin/financial"}>
        <RequireRole allow={["owner", "accountant"]}>
          <FinancialManagement />
        </RequireRole>
      </Route>

      {/* ===== Admin: Clients ===== */}
      <Route path={"/admin/clients"}>
        <RequireRole allow={["owner", "admin"]}>
          <ClientsManagement />
        </RequireRole>
      </Route>

      {/* ===== Admin: VIP ===== */}
      <Route path={"/admin/vip"}>
        <RequireRole allow={["owner", "admin"]}>
          <Vip />
        </RequireRole>
      </Route>

      {/* ===== Admin: Messages ===== */}
      <Route path={"/admin/messages"}>
        <RequireRole allow={["owner", "admin", "staff"]}>
          <MessagesManagement />
        </RequireRole>
      </Route>

      {/* ===== Admin: Settings ===== */}
      <Route path={"/admin/settings"}>
        <RequireRole allow={["owner"]}>
          <Settings />
        </RequireRole>
      </Route>

      {/* ===== Admin: Audit Log ===== */}
      <Route path={"/admin/audit-log"}>
        <RequireRole allow={["owner"]}>
          <AuditLogPage />
        </RequireRole>
      </Route>

      {/* ===== Debug (اختياري) ===== */}
      <Route path={"/admin/debug-auth"}>
        <RequireRole allow={["owner"]}>
          <DebugAuthPage />
        </RequireRole>
      </Route>

      {/* ================= Client Area ================= */}
      <Route path={"/client/dashboard"}>
        <RequireRole allow={["client", "guest"]}>
          <ClientDashboard />
        </RequireRole>
      </Route>

      <Route path={"/client/investments"}>
        <RequireRole allow={["client"]}>
          <MyInvestments />
        </RequireRole>
      </Route>

      {/* ✅ Client Contract Details */}
      <Route path={"/client/contracts/:id"}>
        <RequireRole allow={["client"]}>
          <ClientContractDetails />
        </RequireRole>
      </Route>

      {/* ================= Fallback ================= */}
      <Route component={NotFound} />


    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        {/* خلفية عامة */}
        <div className="rsg-bg" aria-hidden="true" />

        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
