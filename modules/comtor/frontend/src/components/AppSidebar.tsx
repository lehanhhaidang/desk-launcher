import { useState } from 'react';
import {
  FolderOpen,
  Languages,
  Menu,
  X,
  LayoutDashboard,
  Settings,
  Info,
} from 'lucide-react';
import { Button } from '@cmt/components/ui/button';
import { useI18n } from '@cmt/lib/i18n';
import { APP_VERSION } from '@cmt/lib/version';

export type ViewKey =
  | 'dashboard'
  | 'projects'
  | 'project'
  | 'meeting'
  | 'settings'
  | 'version';

const navItems = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'projects', icon: FolderOpen },
] as const;

interface AppSidebarProps {
  currentView: ViewKey;
  onNavigate: (view: ViewKey) => void;
}

export function AppSidebar({ currentView, onNavigate }: AppSidebarProps) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    projects: t.dashboard.projects,
  };

  const go = (view: ViewKey) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  const isActive = (key: ViewKey) =>
    currentView === key ||
    (key === 'projects' && (currentView === 'project' || currentView === 'meeting'));

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border/40 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Languages className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">{t.common.appName}</span>
          <span className="text-xs text-muted-foreground">v{APP_VERSION}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => go(item.key as ViewKey)}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
              isActive(item.key as ViewKey)
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {navLabels[item.key]}
          </button>
        ))}
      </nav>

      <div className="border-t border-border/40 p-3 space-y-1">
        <button
          type="button"
          onClick={() => go('settings')}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
            isActive('settings')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          <Settings className="h-5 w-5" />
          {t.settings.title}
        </button>
        <button
          type="button"
          onClick={() => go('version')}
          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
            isActive('version')
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          }`}
        >
          <Info className="h-5 w-5" />
          Version
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 h-full w-64 border-r border-border/40 bg-card/95 backdrop-blur-md transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

export default AppSidebar;
