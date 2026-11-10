import { randomUUID } from 'node:crypto';
import { NativeProjectError } from '../mcpack/session';
import type { prepareConnectionChange } from './authoring';
import type { SourceAdapter } from './contracts';
import type { UpstreamKind } from './upstream';

export interface VerifiedConnectionChange {
  change: ReturnType<typeof prepareConnectionChange>;
  kind: UpstreamKind;
  adapter?: SourceAdapter;
}

// Discovery may finish after the HTTP client disappears. Only a second request
// from the still-open form can commit a draft. Bound abandoned upstream sessions.
const drafts = new Map<
  string,
  {
    projectId: string;
    generation: number;
    verified: VerifiedConnectionChange;
    timer: ReturnType<typeof setTimeout>;
  }
>();

async function discard(id: string) {
  const draft = drafts.get(id);
  if (!draft) return;
  drafts.delete(id);
  clearTimeout(draft.timer);
  await draft.verified.adapter?.close();
}

export async function stageConnectionDraft(
  projectId: string,
  generation: number,
  verified: VerifiedConnectionChange
) {
  if (drafts.size >= 8) await discard(drafts.keys().next().value!);
  const id = randomUUID();
  const timer = setTimeout(() => {
    void discard(id).catch(() => {});
  }, 15_000);
  timer.unref();
  drafts.set(id, { projectId, generation, verified, timer });
  return id;
}

export function takeConnectionDraft(
  projectId: string,
  generation: number,
  id: string,
  kind: UpstreamKind
) {
  const draft = drafts.get(id);
  if (
    !draft ||
    draft.projectId !== projectId ||
    draft.generation !== generation ||
    draft.verified.kind !== kind
  )
    throw new NativeProjectError(
      'Connection preview expired or the project changed. Connect again.',
      409
    );
  drafts.delete(id);
  clearTimeout(draft.timer);
  return draft.verified;
}

export async function discardConnectionDrafts() {
  await Promise.allSettled([...drafts.keys()].map(discard));
}
