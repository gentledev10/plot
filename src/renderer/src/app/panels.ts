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
