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

// Client pages
import ClientDashboard from "./pages/client/MyDashboard";
import MyInvestments from "./pages/client/MyInvestments";

function Router() {
  return (
    <Switch>
      {/* ============== Public ============== */}
      <Route path={"/"} component={Home} />
      <Route path={"/projects"} component={ProjectsPage} />
      <Route path={"/about"} component={About} />
      <Route path={"/contact"} component={Contact} />
      <Route path={"/projects/:id"} component={ProjectDetails} />

      {/* ============== Auth ============== */}
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/404"} component={NotFound} />

      {/* ============== Admin (Protected) ============== */}
      <Route path={"/dashboard"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <AdminDashboard />
        </RequireRole>
      </Route>

      <Route path={"/admin/projects"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <ProjectsManagement />
        </RequireRole>
      </Route>

      <Route path={"/admin/projects/create"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <CreateProject />
        </RequireRole>
      </Route>

      <Route path={"/admin/projects/:id/edit"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <EditProject />
        </RequireRole>
      </Route>

      {/* ❌ removed Route: /admin/vip */}

      <Route path={"/admin/reports"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <Reports />
        </RequireRole>
      </Route>

      <Route path={"/admin/settings"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <Settings />
        </RequireRole>
      </Route>

      <Route path={"/admin/financial"}>
        <RequireRole allow={["owner", "accountant"]}>
          <FinancialManagement />
        </RequireRole>
      </Route>

      <Route path={"/admin/clients"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <ClientsManagement />
        </RequireRole>
      </Route>

      <Route path={"/admin/messages"}>
        <RequireRole allow={["owner", "accountant", "staff"]}>
          <MessagesManagement />
        </RequireRole>
      </Route>

      <Route path={"/admin/audit-log"}>
        <RequireRole allow={["owner"]}>
          <AuditLogPage />
        </RequireRole>
      </Route>

      <Route path={"/admin/debug-auth"} component={DebugAuthPage} />

      {/* ============== Client (Protected) ============== */}
      <Route path={"/client/dashboard"}>
        <RequireRole allow={["user"]}>
          <ClientDashboard />
        </RequireRole>
      </Route>

      <Route path={"/client/investments"}>
        <RequireRole allow={["user"]}>
          <MyInvestments />
        </RequireRole>
      </Route>

      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
