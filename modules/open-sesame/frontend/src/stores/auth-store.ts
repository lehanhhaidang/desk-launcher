import { create } from 'zustand';
import type { Account } from '@os/types/models';

interface AuthState {
    accounts: Account[];
    isLoading: boolean;
    setAccounts: (accounts: Account[]) => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    accounts: [],
    isLoading: true,
    setAccounts: (accounts) => set({ accounts }),
    setLoading: (isLoading) => set({ isLoading }),
}));
