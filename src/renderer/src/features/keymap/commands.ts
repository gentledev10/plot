export const COMMAND_GROUPS = ['Diff', 'Editor', 'View', 'Navigation', 'AI overview'] as const;

export type CommandGroup = (typeof COMMAND_GROUPS)[number];

interface CommandDefinition {
  id: string;
  title: string;
  group: CommandGroup;
  keys: readonly string[];
}

// Defaults follow IntelliJ IDEA's macOS keymap where it has an equivalent action.
export const COMMANDS = [
  { id: 'diff.nextDifference', title: 'Next difference', group: 'Diff', keys: ['F7'] },
  {
    id: 'diff.previousDifference',
    title: 'Previous difference',
    group: 'Diff',
    keys: ['Shift+F7'],
  },
  { id: 'diff.nextFile', title: 'Next file', group: 'Diff', keys: ['Ctrl+Shift+ArrowRight'] },
  {
    id: 'diff.previousFile',
    title: 'Previous file',
    group: 'Diff',
    keys: ['Ctrl+Shift+ArrowLeft'],
  },
  {
    id: 'diff.toggleSideBySide',
    title: 'Switch between side-by-side and unified',
    group: 'Diff',
    keys: [],
  },
  {
    id: 'diff.toggleCollapseUnchanged',
    title: 'Collapse unchanged fragments',
    group: 'Diff',
    keys: [],
  },
  { id: 'diff.toggleIgnoreWhitespace', title: 'Ignore whitespace', group: 'Diff', keys: [] },
  { id: 'editor.goToLine', title: 'Go to line', group: 'Editor', keys: ['Meta+L'] },
  {
    id: 'editor.extendSelection',
    title: 'Extend selection',
    group: 'Editor',
    keys: ['Alt+ArrowUp'],
  },
  {
    id: 'editor.shrinkSelection',
    title: 'Shrink selection',
    group: 'Editor',
    keys: ['Alt+ArrowDown'],
  },
  { id: 'view.toggleSidebar', title: 'Show or hide the sidebar', group: 'View', keys: ['Meta+1'] },
  {
    id: 'view.toggleReview',
    title: 'Show or hide the AI overview',
    group: 'View',
    keys: ['Meta+2'],
  },
  {
    id: 'view.maximizeReview',
    title: 'Maximize or restore the AI overview',
    group: 'View',
    keys: ["Shift+Meta+'"],
  },
  {
    id: 'view.toggleAllPanels',
    title: 'Hide or restore all panels',
    group: 'View',
    keys: ['Shift+Meta+F12'],
  },
  {
    id: 'pullRequest.open',
    title: 'Open a pull request by URL',
    group: 'Navigation',
    keys: ['Meta+O'],
  },
  {
    id: 'pullRequest.back',
    title: 'Back to the pull request list',
    group: 'Navigation',
    keys: ['Meta+['],
  },
  { id: 'pullRequest.refresh', title: 'Refresh', group: 'Navigation', keys: ['Meta+R'] },
  { id: 'pullRequest.openOnGitHub', title: 'Open on GitHub', group: 'Navigation', keys: [] },
  { id: 'local.open', title: 'Open a local repository', group: 'Navigation', keys: [] },
  { id: 'review.generate', title: 'Explain this change', group: 'AI overview', keys: [] },
] as const satisfies readonly CommandDefinition[];

export type CommandId = (typeof COMMANDS)[number]['id'];

export type Command = CommandDefinition & { id: CommandId };

export function commandTitle(id: CommandId): string {
  return COMMANDS.find((command) => command.id === id)?.title ?? id;
}
