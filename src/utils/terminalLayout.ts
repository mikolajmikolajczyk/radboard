import type { LayoutNode, SplitDirection } from '../types/terminal';

export function splitLeaf(
  root: LayoutNode,
  targetId: string,
  newId: string,
  direction: SplitDirection,
): LayoutNode {
  if (root.type === 'leaf') {
    if (root.terminalId !== targetId) return root;
    return {
      type: 'split',
      direction,
      ratio: 0.5,
      first: root,
      second: { type: 'leaf', terminalId: newId },
    };
  }
  return {
    ...root,
    first: splitLeaf(root.first, targetId, newId, direction),
    second: splitLeaf(root.second, targetId, newId, direction),
  };
}

export function removeLeaf(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === 'leaf') {
    return root.terminalId === targetId ? null : root;
  }
  const newFirst = removeLeaf(root.first, targetId);
  const newSecond = removeLeaf(root.second, targetId);
  if (newFirst === null) return newSecond;
  if (newSecond === null) return newFirst;
  return { ...root, first: newFirst, second: newSecond };
}

export function updateRatio(root: LayoutNode, splitFirst: string, ratio: number): LayoutNode {
  if (root.type === 'leaf') return root;
  if (root.type === 'split') {
    if (root.first.type === 'leaf' && root.first.terminalId === splitFirst) {
      return { ...root, ratio };
    }
    if (root.second.type === 'leaf' && root.second.terminalId === splitFirst) {
      return { ...root, ratio };
    }
    return {
      ...root,
      first: updateRatio(root.first, splitFirst, ratio),
      second: updateRatio(root.second, splitFirst, ratio),
    };
  }
  return root;
}

export function collectLeafIds(root: LayoutNode): string[] {
  if (root.type === 'leaf') return [root.terminalId];
  return [...collectLeafIds(root.first), ...collectLeafIds(root.second)];
}
