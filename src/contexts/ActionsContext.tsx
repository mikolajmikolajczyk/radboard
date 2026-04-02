import { createContext, useContext } from 'react';
import type { IssueComment, PatchRef } from '../types/kanban';
import type { FileDiff } from '../components/patches/DiffView';

interface ActionsContextValue {
  onRefresh: () => void;
  onBanUser: (did: string, alias: string, scope: 'all' | 'issues' | 'comments') => void;
  onUnbanUser: (did: string) => void;
  onStateChange: (issueId: string, colId: string) => void;
  onOpenPatch: (patch: PatchRef, issueId: string) => void;
  onSelectIssue: (id: string | null) => void;
  onBrowseFile: (commitOid: string, path: string) => void;
  onViewPatchFile: (fileDiffs: FileDiff[], commitOid: string, patchTitle: string, path: string, patchId: string, revisionId: string) => void;
  onOpenIssue: (prefix: string) => void;
  onCommentsLoaded: (issueId: string, comments: IssueComment[]) => void;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

export function ActionsProvider({ value, children }: { value: ActionsContextValue; children: React.ReactNode }) {
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

export function useActions(): ActionsContextValue {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions must be used within ActionsProvider');
  return ctx;
}
