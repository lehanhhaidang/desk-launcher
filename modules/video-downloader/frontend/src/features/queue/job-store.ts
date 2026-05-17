// Unified job store for Capture, Image, and Video pipelines.
//
// Each feature reports start / progress / terminal events here so the Queue
// tab can render a single timeline without each feature having to know about
// the others. Only the Queue tab subscribes to the full list; the feature
// tabs keep their own foreground state for the inline action UI.

import { create } from 'zustand'
import type { MediaJob, MediaJobKind, MediaJobStatus } from '../../shared/types'

export interface JobUpsertInput {
  id: string
  kind: MediaJobKind
  label: string
  status?: MediaJobStatus
  progress?: number
  detail?: string
}

export interface JobPatch {
  status?: MediaJobStatus
  progress?: number
  detail?: string
  output?: string
  outputName?: string
  error?: string
}

interface JobStoreState {
  jobs: MediaJob[]
  upsert: (input: JobUpsertInput) => void
  patch: (id: string, patch: JobPatch) => void
  remove: (id: string) => void
  clearFinished: () => void
}

const TERMINAL: MediaJobStatus[] = ['completed', 'failed', 'cancelled']

export const useJobStore = create<JobStoreState>((set) => ({
  jobs: [],
  upsert: (input) =>
    set((state) => {
      const now = Date.now()
      const idx = state.jobs.findIndex((job) => job.id === input.id)
      if (idx !== -1) {
        const next = [...state.jobs]
        const previous = next[idx]
        next[idx] = {
          ...previous,
          kind: input.kind,
          label: input.label,
          status: input.status ?? previous.status,
          progress: input.progress ?? previous.progress,
          detail: input.detail ?? previous.detail,
          updatedAt: now,
        }
        return { jobs: next }
      }
      const job: MediaJob = {
        id: input.id,
        kind: input.kind,
        label: input.label,
        status: input.status ?? 'queued',
        progress: input.progress ?? 0,
        detail: input.detail,
        createdAt: now,
        updatedAt: now,
      }
      return { jobs: [job, ...state.jobs] }
    }),
  patch: (id, patch) =>
    set((state) => {
      const idx = state.jobs.findIndex((job) => job.id === id)
      if (idx === -1) return state
      const next = [...state.jobs]
      const previous = next[idx]
      next[idx] = {
        ...previous,
        ...patch,
        progress:
          patch.progress != null
            ? Math.min(100, Math.max(0, patch.progress))
            : previous.progress,
        updatedAt: Date.now(),
      }
      return { jobs: next }
    }),
  remove: (id) => set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) })),
  clearFinished: () =>
    set((state) => ({ jobs: state.jobs.filter((job) => !TERMINAL.includes(job.status)) })),
}))

export function isJobTerminal(status: MediaJobStatus): boolean {
  return TERMINAL.includes(status)
}
