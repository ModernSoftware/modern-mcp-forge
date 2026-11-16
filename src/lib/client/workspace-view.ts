const key = (project: string) => 'forge.workspace.view.v1.' + project;
const defaults = () => ({
  view: 'detailed',
  search: '',
  kind: 'all',
  sourceKind: 'all',
  expanded: { native: false, bridge: false, external: false }
});
type WorkspaceView = ReturnType<typeof defaults>;

export function readWorkspaceView(project: string): WorkspaceView {
  const value = defaults();
  try {
    const saved = JSON.parse(sessionStorage.getItem(key(project)) ?? 'null');
    if (!saved) return value;
    if (saved.view === 'grouped') value.view = 'grouped';
    if (typeof saved.search === 'string') value.search = saved.search;
    if (['tools', 'resources', 'prompts'].includes(saved.kind))
      value.kind = saved.kind;
    if (['native', 'bridge', 'external'].includes(saved.sourceKind))
      value.sourceKind = saved.sourceKind;
    for (const group of ['native', 'bridge', 'external'] as const) {
      value.expanded[group] = saved.expanded?.[group] === true;
    }
  } catch {
    /* Storage may be disabled or contain an older value. */
  }
  return value;
}

export function saveWorkspaceView(project: string, value: WorkspaceView) {
  try {
    sessionStorage.setItem(key(project), JSON.stringify(value));
  } catch {
    /* The current view remains usable with storage disabled. */
  }
}
