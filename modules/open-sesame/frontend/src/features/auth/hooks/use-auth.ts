import { useCallback } from 'react';
import { invoke } from '@os/lib/tauri';
import { useAuthStore } from '@os/stores/auth-store';
import type { Account } from '@os/types/models';

/**
 * Auth hook — chỉ expose utilities, KHÔNG auto-fetch.
 * App.tsx là nơi duy nhất gọi fetchAccounts() khi mount.
 */
export function useAuth() {
    const accounts = useAuthStore((s) => s.accounts);
    const isLoading = useAuthStore((s) => s.isLoading);

    const fetchAccounts = useCallback(async () => {
        useAuthStore.getState().setLoading(true);
        try {
            const data = await invoke<Account[]>('auth_list_accounts');
            useAuthStore.getState().setAccounts(data);
        } finally {
            useAuthStore.getState().setLoading(false);
        }
    }, []);

    const logout = useCallback(async (accountId: string) => {
        await invoke('auth_logout', { accountId });
        const current = useAuthStore.getState().accounts;
        useAuthStore.getState().setAccounts(current.filter((a) => a.id !== accountId));
    }, []);

    const isLoggedIn = accounts.length > 0;

    return { accounts, isLoggedIn, isLoading, fetchAccounts, logout };
}
