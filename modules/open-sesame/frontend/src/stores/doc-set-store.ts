import { create } from 'zustand';
import type { DocSet } from '@os/types/models';

interface DocSetState {
    docSets: DocSet[];
    setDocSets: (docSets: DocSet[]) => void;
    addDocSet: (ds: DocSet) => void;
    removeDocSet: (id: string) => void;
}

export const useDocSetStore = create<DocSetState>((set) => ({
    docSets: [],
    setDocSets: (docSets) => set({ docSets }),
    addDocSet: (ds) =>
        set((state) => ({ docSets: [...state.docSets, ds] })),
    removeDocSet: (id) =>
        set((state) => ({
            docSets: state.docSets.filter((d) => d.id !== id),
        })),
}));
