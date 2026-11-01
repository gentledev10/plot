export type PanelId = 'sidebar' | 'review';

export type PanelLayout = Record<PanelId, boolean>;

export const DEFAULT_LAYOUT: PanelLayout = { sidebar: true, review: true };

export function parseLayout(stored: unknown): PanelLayout | undefined {
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const { sidebar, review } = stored as Record<string, unknown>;
  return typeof sidebar === 'boolean' && typeof review === 'boolean'
    ? { sidebar, review }
    : undefined;
}

export function togglePanel(layout: PanelLayout, panel: PanelId): PanelLayout {
  return { ...layout, [panel]: !layout[panel] };
}

export const TOOL_WINDOWS = ['pull-requests', 'local-changes'] as const;

export type ToolWindowId = (typeof TOOL_WINDOWS)[number];

export const DEFAULT_TOOL_WINDOW: ToolWindowId = 'pull-requests';

export function parseToolWindow(stored: unknown): ToolWindowId | undefined {
  return TOOL_WINDOWS.find((id) => id === stored);
}

export interface ToolWindowState {
  layout: PanelLayout;
  window: ToolWindowId;
}

export function toggleToolWindow(
  { layout, window }: ToolWindowState,
  target: ToolWindowId,
): ToolWindowState {
  if (layout.sidebar && window === target) {
    return { layout: { ...layout, sidebar: false }, window };
  }
  return { layout: { ...layout, sidebar: true }, window: target };
}

export interface ToggleAllResult {
  layout: PanelLayout;
  restore?: PanelLayout;
}

export function toggleAllPanels(
  layout: PanelLayout,
  restore: PanelLayout | undefined,
): ToggleAllResult {
  if (layout.sidebar || layout.review) {
    return { layout: { sidebar: false, review: false }, restore: layout };
  }
  return { layout: restore ?? DEFAULT_LAYOUT };
}

export type PanelSizes = Record<PanelId, number>;

export const DEFAULT_SIZES: PanelSizes = { sidebar: 300, review: 360 };

export const SIZE_LIMITS: Record<PanelId, { min: number; max: number }> = {
  sidebar: { min: 200, max: 640 },
  review: { min: 280, max: 1000 },
};

export function clampSize(panel: PanelId, width: number): number {
  const { min, max } = SIZE_LIMITS[panel];
  return Math.round(Math.min(max, Math.max(min, width)));
}

export function parseSizes(stored: unknown): PanelSizes | undefined {
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const { sidebar, review } = stored as Record<string, unknown>;
  return typeof sidebar === 'number' && typeof review === 'number'
    ? { sidebar: clampSize('sidebar', sidebar), review: clampSize('review', review) }
    : undefined;
}

export const MIN_WORKSPACE_WIDTH = 480;
export const TOOL_BARS_WIDTH = 72;

export function fitPanels(
  viewport: number,
  sizes: PanelSizes,
  requested: PanelLayout,
  priority: PanelId = 'sidebar',
): { layout: PanelLayout; sizes: PanelSizes } {
  const layout = { ...requested };
  const fitted = { ...sizes };
  const budget = Math.max(0, viewport - TOOL_BARS_WIDTH - MIN_WORKSPACE_WIDTH);
  const other = priority === 'sidebar' ? 'review' : 'sidebar';
  if (
    layout.sidebar &&
    layout.review &&
    (viewport < 1_100 || budget < SIZE_LIMITS.sidebar.min + SIZE_LIMITS.review.min)
  ) {
    layout[other] = false;
  }
  const reserved = layout[other] ? SIZE_LIMITS[other].min : 0;
  fitted[priority] = layout[priority]
    ? Math.min(clampSize(priority, sizes[priority]), Math.max(0, budget - reserved))
    : 0;
  fitted[other] = layout[other]
    ? Math.min(clampSize(other, sizes[other]), Math.max(0, budget - fitted[priority]))
    : 0;
  return { layout, sizes: fitted };
}
