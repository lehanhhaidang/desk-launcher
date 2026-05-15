import { Info } from 'lucide-react';
import { APP_VERSION } from '@cmt/lib/version';

export function VersionPage() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center gap-3">
        <Info className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Virtual Comtor</h1>
          <p className="text-sm text-muted-foreground">Version {APP_VERSION}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border/40 bg-card/40 p-5 text-sm leading-relaxed text-muted-foreground">
        <p>Real-time JP ↔ VN meeting translator built on Tauri 2 + React 19.</p>
        <p className="mt-2">
          All data is stored locally on your machine. Your API keys are kept in Windows Credential Manager.
        </p>
      </div>
    </div>
  );
}

export default VersionPage;
