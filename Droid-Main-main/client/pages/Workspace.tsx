import { AssistantWorkspace } from "@/components/assistant-workspace";

export default function Workspace({ view = "workspace" }: { view?: string }) {
  return <AssistantWorkspace view={view as any} />;
}
