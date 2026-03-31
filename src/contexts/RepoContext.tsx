import { createContext, useContext } from 'react';
import type { BannedEntry } from '../types/radboard';

interface RepoContextValue {
  rid: string;
  myDid: string | null;
  delegateDids: string[];
  explorerUrl: string;
  seedNode: string;
  localRepoPath: string | null;
  defaultBranch: string;
  preferredEditor: string | null;
  columns: { id: string; title: string }[];
  columnColors: Record<string, string>;
  labelSuggestions: string[];
  bannedUsers: BannedEntry[];
}

const RepoContext = createContext<RepoContextValue | null>(null);

export function RepoProvider({ value, children }: { value: RepoContextValue; children: React.ReactNode }) {
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepo must be used within RepoProvider');
  return ctx;
}
