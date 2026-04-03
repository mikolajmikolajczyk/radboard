export const ALL_TYPES = [
  'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'chore', 'ci', 'build',
] as const;

export type ConventionalType = (typeof ALL_TYPES)[number];

export const SKIPPED_TYPES = new Set<ConventionalType>(['chore', 'ci', 'build']);

export const TYPE_META: Record<ConventionalType, { label: string; css: string }> = {
  feat:     { label: 'new feature',    css: 'feat' },
  fix:      { label: 'bug fix',        css: 'fix' },
  refactor: { label: 'refactor',       css: 'refactor' },
  perf:     { label: 'performance',    css: 'perf' },
  docs:     { label: 'documentation',  css: 'docs' },
  test:     { label: 'tests',          css: 'test' },
  chore:    { label: 'maintenance',    css: 'chore' },
  ci:       { label: 'ci/cd',          css: 'chore' },
  build:    { label: 'build system',   css: 'chore' },
};

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/;

export interface ParsedConventional {
  type: ConventionalType;
  scope: string | null;
  description: string;
}

export function parseConventional(message: string): ParsedConventional | null {
  const m = message.match(CONVENTIONAL_RE);
  if (!m) return null;
  const t = m[1].toLowerCase();
  if (!(ALL_TYPES as readonly string[]).includes(t)) return null;
  return {
    type: t as ConventionalType,
    scope: m[2] || null,
    description: m[3],
  };
}

export function formatConventional(
  type: ConventionalType,
  scope: string | null,
  description: string,
): string {
  const prefix = scope ? `${type}(${scope})` : type;
  return `${prefix}: ${description}`;
}

export function isSkipped(type: ConventionalType): boolean {
  return SKIPPED_TYPES.has(type);
}
