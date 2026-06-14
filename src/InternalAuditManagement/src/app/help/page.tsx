import { ApplicationTutorial } from "@/components/help/application-tutorial";
import { AppShell } from "@/components/layout/app-shell";

export default function HelpPage() {
  return (
    <AppShell>
      <div className="topbar">
        <div>
          <div className="eyebrow">Help and Training</div>
          <h1>How to use Facility Control</h1>
          <p className="muted">Watch the embedded walkthrough and review the claim submission essentials.</p>
        </div>
      </div>
      <ApplicationTutorial />
    </AppShell>
  );
}
