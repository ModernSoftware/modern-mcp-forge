<script lang="ts">
  import { onMount } from 'svelte';
  import type * as Monaco from 'monaco-editor';

  let {
    value,
    language = 'plaintext',
    readOnly = false,
    onChange,
    onSave
  } = $props<{
    value: string;
    language?: string;
    readOnly?: boolean;
    onChange?: (value: string) => void;
    onSave?: () => void;
  }>();

  let container: HTMLDivElement;
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let model: Monaco.editor.ITextModel | undefined;
  let monacoApi: typeof import('monaco-editor') | undefined;

  function currentTheme(): 'vs' | 'vs-dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'vs-dark' : 'vs';
  }

  onMount(() => {
    let disposed = false;

    let changeSubscription: Monaco.IDisposable | undefined;
    let saveAction: Monaco.IDisposable | undefined;
    let themeObserver: MutationObserver | undefined;

    void (async () => {
      const module = await import('$lib/client/monaco');

      // The component might have been destroyed while Monaco was loading.
      if (disposed) {
        return;
      }

      monacoApi = module.monaco;

      model = monacoApi.editor.createModel(value, language);

      editor = monacoApi.editor.create(container, {
        model,
        readOnly,
        automaticLayout: true,
        minimap: {
          enabled: true
        },
        fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
        fontSize: 13,
        lineHeight: 21,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: {
          top: 14,
          bottom: 14
        },
        renderWhitespace: 'selection',
        tabSize: 2,
        theme: currentTheme()
      });

      changeSubscription = editor.onDidChangeModelContent(() => {
        onChange?.(editor?.getValue() ?? '');
      });

      if (onSave) {
        saveAction = editor.addAction({
          id: 'forge-save-source',
          label: 'Save Source',
          keybindings: [
            monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS
          ],
          run: () => {
            onSave?.();
          }
        });
      }

      themeObserver = new MutationObserver(() => {
        monacoApi?.editor.setTheme(currentTheme());
      });

      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    })();

    return () => {
      disposed = true;

      changeSubscription?.dispose();
      saveAction?.dispose();
      themeObserver?.disconnect();

      editor?.dispose();
      model?.dispose();
    };
  });

  $effect(() => {
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  });

  $effect(() => {
    if (model && monacoApi) {
      monacoApi.editor.setModelLanguage(model, language);
    }
  });

  $effect(() => {
    editor?.updateOptions({
      readOnly
    });
  });
</script>

<div class="editor-shell">
  <div bind:this={container} class="editor"></div>
</div>

<style>
  .editor-shell {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-solid);
  }

  .editor {
    width: 100%;
    height: min(64vh, 650px);
    min-height: 420px;
  }

  @media (max-width: 720px) {
    .editor {
      min-height: 360px;
    }
  }
</style>
