<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';

  type DefinitionKind = 'tool' | 'resource' | 'prompt';

  let { kind, definition } = $props<{
    kind: DefinitionKind;
    definition: Record<string, unknown> & {
      name: string;
      enabled: boolean;
    };
  }>();

  let editorOpen = $state(false);
  let editorText = $state('');
  let editorOriginal = $state('');
  let errorMessage = $state('');
  let saving = $state(false);
  let toggling = $state(false);
  let deleting = $state(false);

  const dirty = $derived(editorText !== editorOriginal);

  function openEditor() {
    const text = JSON.stringify(definition, null, 2);

    editorText = text;
    editorOriginal = text;
    errorMessage = '';
    editorOpen = true;
  }

  async function saveDefinition() {
    if (saving || !dirty) return;

    errorMessage = '';

    let payload: unknown;

    try {
      payload = JSON.parse(editorText);
    } catch (error) {
      errorMessage = `Invalid JSON: 
        ${
          error instanceof Error
            ? error.message
            : String(error)
        }`;

        return;
    }

    saving = true;

    try {
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `Save failed (${response.status}).`);
      }

      editorOriginal = JSON.stringify(result.definition, null, 2);
      editorText = editorOriginal;

      await invalidateAll();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      saving = false;
    }
  }

  async function toggleEnabled() {
    if (toggling) return;

    toggling = true;
    errorMessage = '';

    try {
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            enabled: !definition.enabled
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `Update failed (${response.status}).`);
      }

      await invalidateAll();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      toggling = false;
    }
  }

  async function deleteDefinition() {
    if (deleting) return;

    const confirmed = confirm(
      `Delete the ${kind} definition "${definition.name}"?\n\nIts source/template/resource file will NOT be deleted.`
    );

    if (!confirmed) return;

    deleting = true;
    errorMessage = '';

    try {
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'DELETE'
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `Delete failed (${response.status}).`);
      }

      await invalidateAll();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      deleting = false;
    }
  }
</script>

<article class="definition-card">
  <header>
    <div>
      <div class="definition-title">
        <strong>{definition.name}</strong>

        <span
          class:enabled={definition.enabled}
          class:disabled={!definition.enabled}
        >
          {definition.enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>

      <code>{kind}</code>
    </div>

    <div class="actions">
      <button
        class="secondary-button compact"
        type="button"
        onclick={openEditor}
      >
        Edit JSON
      </button>

      <button
        class="secondary-button compact"
        type="button"
        disabled={toggling}
        onclick={toggleEnabled}
      >
        {toggling
          ? 'Updating…'
          : definition.enabled
            ? 'Disable'
            : 'Enable'}
      </button>

      <button
        class="danger-button compact"
        type="button"
        disabled={deleting}
        onclick={deleteDefinition}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  </header>

  {#if errorMessage}
    <div class="error-panel">{errorMessage}</div>
  {/if}

  {#if editorOpen}
    <div class="editor-panel">
      <div class="editor-heading">
        <div>
          <strong>Edit definition</strong>
          <span>
            Name is immutable in this release. Other fields are revalidated before the manifest is replaced.
          </span>
        </div>

        <button
          class="close-button"
          type="button"
          aria-label="Close editor"
          onclick={() => (editorOpen = false)}
        >
          ×
        </button>
      </div>

      <MonacoEditor
        value={editorText}
        language="json"
        onChange={(value) => (editorText = value)}
        onSave={saveDefinition}
      />

      <div class="editor-footer">
        <span>{dirty ? 'Unsaved changes' : 'Saved'}</span>

        <div>
          <button
            class="secondary-button compact"
            type="button"
            disabled={!dirty}
            onclick={() => (editorText = editorOriginal)}
          >
            Reset
          </button>

          <button
            class="primary-button compact"
            type="button"
            disabled={!dirty || saving}
            onclick={saveDefinition}
          >
            {saving ? 'Saving…' : 'Save definition'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</article>

<style>
  .definition-card {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 48%,
        transparent
      );
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 15px;
  }

  .definition-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .definition-title strong {
    font-size: 0.8rem;
  }

  .definition-title span {
    padding: 4px 6px;
    border-radius: 999px;
    font-size: 0.55rem;
    font-weight: 900;
  }

  .definition-title span.enabled {
    color: var(--success);
    background: var(--success-soft);
  }

  .definition-title span.disabled {
    color: var(--muted);
    background:
      color-mix(
        in srgb,
        var(--muted) 10%,
        transparent
      );
  }

  header code {
    display: block;
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.62rem;
    text-transform: uppercase;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }

  .compact {
    min-height: 33px;
    padding: 0 10px;
    font-size: 0.66rem;
  }

  .danger-button {
    border: 1px solid
      color-mix(
        in srgb,
        var(--danger) 30%,
        var(--border)
      );
    border-radius: 9px;
    color: var(--danger);
    background:
      color-mix(
        in srgb,
        var(--danger) 6%,
        transparent
      );
    font-weight: 850;
    cursor: pointer;
  }

  .danger-button:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .error-panel {
    margin-top: 12px;
    padding: 10px 11px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--danger) 32%,
        var(--border)
      );
    border-radius: 9px;
    color: var(--danger);
    background: var(--danger-soft);
    font-size: 0.68rem;
  }

  .editor-panel {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }

  .editor-heading,
  .editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 13px;
  }

  .editor-heading {
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .editor-heading strong,
  .editor-heading span {
    display: block;
  }

  .editor-heading strong {
    font-size: 0.74rem;
  }

  .editor-heading span {
    margin-top: 3px;
    color: var(--muted);
    font-size: 0.63rem;
    line-height: 1.45;
  }

  .close-button {
    width: 31px;
    height: 31px;
    flex: 0 0 31px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }

  .editor-footer {
    margin-top: 8px;
    color: var(--muted);
    font-size: 0.63rem;
  }

  .editor-footer > div {
    display: flex;
    gap: 7px;
  }

  @media (max-width: 700px) {
    header,
    .editor-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .actions {
      justify-content: flex-start;
    }
  }
</style>
