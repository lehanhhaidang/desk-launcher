import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '@os/features/auth/hooks/use-auth';
import { LoginScreen } from '@os/features/auth/components/login-screen';
import { AppLayout } from '@os/components/layout/app-layout';
import { SessionSyncGate } from '@os/features/sync/components/session-sync-gate';
import { LoadingState } from '@os/components/ui';

export default function App() {
  const { isLoggedIn, isLoading, fetchAccounts } = useAuth();

  // Fetch accounts exactly once on mount
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

    if (isLoading) {
        return (
      <div className="app-bg flex h-screen items-center justify-center">
        <div className="soft-panel purple-haze min-w-80 rounded-xl border px-10 py-9">
          <LoadingState label="Opening Open Sesame" />
        </div>
      </div>
        );
    }

  return (
    <BrowserRouter>
      <Routes>
        {!isLoggedIn ? (
          <Route path="*" element={<LoginScreen />} />
        ) : (
          <Route
            path="/*"
            element={
              <SessionSyncGate>
                <AppLayout />
              </SessionSyncGate>
            }
          />
        )}
      </Routes>
    </BrowserRouter>
  );
}
