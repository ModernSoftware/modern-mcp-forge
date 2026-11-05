/** A failed source startup still produces a new generation and editable files. */
export async function reloadProjectSources(
  projectId: string,
  generation: number
) {
  const response = await fetch('/api/project/sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'reload', projectId, generation })
  });
  const snapshot = await response.json();
  if (!response.ok && snapshot.status !== 'failed')
    throw new Error(snapshot.error ?? 'Reload failed.');
  return snapshot as {
    status: string;
    error?: string;
    sources: { id: string; status: string }[];
  };
}
