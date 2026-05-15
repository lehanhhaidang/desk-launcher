export type ChangeType = 'bug' | 'feature' | 'improvement';

export type ChangeItem = {
  version: string; // SemVer: MAJOR.MINOR.PATCH
  date: string; // ISO date (YYYY-MM-DD)
  type: ChangeType;
  title: string;
  description?: string;
};

/**
 * Changelog entries.
 *
 * Notes:
 * - One shared SemVer across the whole app.
 * - Filtered by tab: bugs / features / improvements.
 */
export const CHANGELOG: ChangeItem[] = [
  // Example seed entries — replace with real release notes.
  {
    version: '1.0.0',
    date: '2026-03-23',
    type: 'feature',
    title: 'Initial release',
    description: 'First public version of Virtual Comtor.',
  },
  {
    version: '1.0.1',
    date: '2026-03-23',
    type: 'bug',
    title: 'Fix minor UI glitches',
  },
  {
    version: '1.0.1',
    date: '2026-03-23',
    type: 'improvement',
    title: 'Improve loading states',
  },
];
