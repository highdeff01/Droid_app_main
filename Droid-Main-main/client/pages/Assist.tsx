import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssistBridgeBadge } from "@/components/assist-bridge-status";
import { AssistChatPanel, AssistScreenshotPanel, AssistSwarmPanel } from "@/components/assist/ai-panels";
import { AssistCoordinatePanel, AssistVerifyPanels, AssistWorkflowPanel } from "@/components/assist/action-panels";
import { AssistActivityPanel } from "@/components/assist/activity-panel";

interface AssistTab {
  value: string;
  title: string;
  Panel: ComponentType;
}

/** The Assist page's tabs, in display order, grouped like the Dashboard's tab groups. */
export const ASSIST_TAB_GROUPS: { label: string; tabs: AssistTab[] }[] = [
  {
    label: "AI",
    tabs: [
      { value: "chat", title: "AI chat", Panel: AssistChatPanel },
      { value: "swarm", title: "AI swarm", Panel: AssistSwarmPanel },
      { value: "screenshot", title: "Screenshot", Panel: AssistScreenshotPanel },
    ],
  },
  {
    label: "Act",
    tabs: [
      { value: "workflow", title: "Workflow", Panel: AssistWorkflowPanel },
      { value: "coordinates", title: "Coordinates", Panel: AssistCoordinatePanel },
      { value: "verify", title: "Verify / watch / help", Panel: AssistVerifyPanels },
    ],
  },
  {
    label: "Bridge",
    tabs: [{ value: "activity", title: "Activity", Panel: AssistActivityPanel }],
  },
];

const ALL_TABS = ASSIST_TAB_GROUPS.flatMap((g) => g.tabs);

/** Dedicated page for working with droid-new over the assist bridge. */
export default function Assist() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Assist</h1>
        <AssistBridgeBadge />
        <Link to="/assist/settings" className="text-xs text-cyan-400 underline">droid-new settings</Link>
        <Link to="/dashboard" className="text-xs text-slate-400 underline">Dashboard</Link>
      </header>
      <Tabs defaultValue="chat">
        <TabsList className="flex flex-wrap h-auto gap-1.5 bg-slate-900 border border-slate-800 p-2 rounded-xl mb-4">
          {ASSIST_TAB_GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="flex items-center gap-1">
              <span className="px-1 text-[10px] font-semibold uppercase text-slate-500">{group.label}</span>
              {group.tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 text-xs gap-1">
                  {tab.title}
                </TabsTrigger>
              ))}
            </div>
          ))}
        </TabsList>
        {ALL_TABS.map(({ value, Panel }) => (
          <TabsContent key={value} value={value} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <Panel />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
