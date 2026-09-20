<script lang="ts">
  let { data } = $props();

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'medium'
        }).format(new Date(value))
      : '—';

  function prettyJson(value: string | null): string {
    if (!value) {
      return '';
    }

    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
</script>

<svelte:head>
  <title>Modern MCP Forge · Execution #{data.execution.id}</title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">EXECUTION #{data.execution.id}</div>
    <h1>{data.execution.toolName}</h1>
    <p>
      {data.execution.executionUid ?? 'No execution UUID'} ·
      {formatDate(data.execution.startedAt)}
    </p>
  </div>

  <span
    class:status-success={data.execution.status === 'succeeded'}
    class:status-failed={data.execution.status !== 'succeeded'}
  >
    <span class="status-dot"></span>
    {data.execution.status}
  </span>
</section>

<div class="execution-grid">
  <section class="glass-card summary">
    <div class="eyebrow">SUMMARY</div>

    <dl>
      <div><dt>Runtime</dt><dd><span class="runtime-badge {data.execution.runtime}">{data.execution.runtime}</span></dd></div>
      <div><dt>Duration</dt><dd>{data.execution.durationMs ?? 0} ms</dd></div>
      <div><dt>Exit code</dt><dd>{data.execution.exitCode ?? '—'}</dd></div>
      <div><dt>Started</dt><dd>{formatDate(data.execution.startedAt)}</dd></div>
      <div><dt>Completed</dt><dd>{formatDate(data.execution.completedAt)}</dd></div>
      <div><dt>Entrypoint</dt><dd><code>{data.execution.entrypoint ?? 'Not recorded'}</code></dd></div>
    </dl>
  </section>

  <section class="glass-card payloads">
    <div class="eyebrow">PAYLOADS & DIAGNOSTICS</div>

    <div class="payload">
      <h2>Arguments</h2>
      <pre class="code-block">{prettyJson(data.execution.argumentsJson) || '{}'}</pre>
    </div>

    <div class="payload">
      <h2>Result</h2>
      <pre class="code-block">{prettyJson(data.execution.resultJson) || '(No result recorded)'}</pre>
    </div>

    {#if data.execution.stderrText}
      <div class="payload">
        <h2>stderr</h2>
        <pre class="code-block">{data.execution.stderrText}</pre>
      </div>
    {/if}

    {#if data.execution.errorText}
      <div class="payload">
        <h2>Error</h2>
        <pre class="code-block error">{data.execution.errorText}</pre>
      </div>
    {/if}
  </section>
</div>

<style>
  .execution-grid {
    display: grid;
    grid-template-columns: minmax(290px, 0.65fr) minmax(0, 1.35fr);
    gap: 16px;
  }

  .summary,
  .payloads {
    min-width: 0;
    padding: 21px;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--border);
  }

  dl div {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 10px;
    padding: 11px;
    background: color-mix(in srgb, var(--surface-solid) 54%, transparent);
  }

  dt {
    color: var(--muted);
    font-size: 0.67rem;
    font-weight: 820;
  }

  dd {
    min-width: 0;
    margin: 0;
    font-size: 0.72rem;
  }

  dd code {
    display: block;
    overflow-wrap: anywhere;
  }

  .payload + .payload {
    margin-top: 16px;
  }

  .payload h2 {
    margin: 0 0 7px;
    color: var(--muted);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .code-block.error {
    color: #ffd6da;
  }

  @media (max-width: 900px) {
    .execution-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
