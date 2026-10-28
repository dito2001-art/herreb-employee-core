import { EMP003CopyLibrary } from "./emp003-copy-library";
import { EMP003CampaignDashboard } from "./emp003-campaign-dashboard";

export function EMP003Pilot() {
  return (
    <div className="min-h-screen bg-kumo-elevated text-kumo-default">
      <header className="border-b border-kumo-line bg-kumo-base px-5 py-4">
        <strong>HerreB AI Workforce</strong> · Piloto AI Marketer
      </header>
      <main className="mx-auto max-w-5xl p-5">
        <EMP003CampaignDashboard />
        <EMP003CopyLibrary />
      </main>
    </div>
  );
}
