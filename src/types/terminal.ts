export type SplitDirection = 'horizontal' | 'vertical';

export type LayoutNode =
  | { type: 'leaf'; terminalId: string }
  | {
      type: 'split';
      direction: SplitDirection;
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

export interface TerminalSession {
  id: string;
  rid: string;
  title: string;
}

export interface TerminalTab {
  id: string;
  layout: LayoutNode;
  sessions: string[];
  activeId: string;
}

export interface RepoTerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  allSessions: TerminalSession[];
}
