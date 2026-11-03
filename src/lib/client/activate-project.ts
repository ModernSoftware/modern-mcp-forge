export async function activateProject(projectId: string, resume: boolean) {
  const response = await fetch('/api/projects/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, resume })
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(
      payload.error ?? `Could not open project (${response.status}).`
    );
  }
}
