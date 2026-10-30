import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { BridgeHealthMonitorFooter } from "@/components/bridge-health-monitor-footer";
import { BackendUnreachableBanner } from "@/components/backend-unreachable-banner";
import { PreviewModeBanner } from "@/components/preview-mode-banner";

import Dashboard from "./pages/Dashboard";
const AiMonitor = lazy(() => import("./pages/AiMonitor"));
const Automation = lazy(() => import("./pages/automation/index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Captures = lazy(() => import("./pages/Captures"));
const Operations = lazy(() => import("./pages/Operations"));
const Accomplishments = lazy(() => import("./pages/Accomplishments"));
const Recordings = lazy(() => import("./pages/Recordings"));
const Workflows = lazy(() => import("./pages/Workflows"));
import PhoneDevicePanel from "./components/phone-device-panel";
const MobileRemote = lazy(() => import("./pages/MobileRemote"));
const Assist = lazy(() => import("./pages/Assist"));
const AssistSettings = lazy(() => import("./pages/AssistSettings"));

const queryClient = new QueryClient();

const App = () => (
  <RouteErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BackendUnreachableBanner />
        <PreviewModeBanner />
        <BrowserRouter>
          <Suspense fallback={<RouteLoadingFallback />}>
            <div className="pb-10">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/screen" element={<Dashboard initialTab="screen" />} />
                <Route
                  path="/dual-ai"
                  element={<Dashboard initialTab="dual-ai" />}
                />
                <Route path="/ai-monitor" element={<AiMonitor />} />
                <Route path="/automation" element={<Automation />} />
                <Route path="/workspace" element={<Workspace />} />
                <Route path="/debugger" element={<Workspace view="debugger" />} />
                <Route path="/workflow-debugger" element={<Workspace view="debugger" />} />
                <Route path="/captures" element={<Captures />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="/accomplishments" element={<Accomplishments />} />
                <Route path="/recordings" element={<Recordings />} />
                <Route path="/workflows" element={<Workflows />} />
                <Route path="/drive" element={<Navigate to="/dashboard" replace />} />
                <Route path="/phone-control" element={<PhoneDevicePanel pairedOnly />} />
                <Route path="/mobile-remote" element={<MobileRemote />} />
                <Route path="/mobile-link" element={<MobileRemote />} />
                <Route path="/assist" element={<Assist />} />
                <Route path="/assist/settings" element={<AssistSettings />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <BridgeHealthMonitorFooter />
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </RouteErrorBoundary>
);

const RouteLoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-cyan-400 font-mono">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading AI Automation Workspace...</span>
    </div>
  </div>
);

export default App;
