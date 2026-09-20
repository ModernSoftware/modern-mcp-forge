<script lang="ts">
  let { data } = $props();

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(new Date(value));
</script>

<svelte:head>
  <title>Modern MCP Forge · Executions</title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">OBSERVABILITY</div>
    <h1>Executions</h1>
    <p>
      Runtime history for tool calls originating from both MCP clients and the Forge workbench.
    </p>
  </div>
</section>

<div class="stats">
  <article class="glass-card">
    <strong>{data.stats.total}</strong>
    <span>Total</span>
  </article>
  <article class="glass-card">
    <strong>{data.stats.succeeded}</strong>
    <span>Succeeded</span>
  </article>
  <article class="glass-card">
    <strong>{data.stats.failed}</strong>
    <span>Failed</span>
  </article>
  <article class="glass-card">
    <strong>{data.stats.averageDurationMs} ms</strong>
    <span>Average duration</span>
  </article>
</div>

<section class="table-card glass-card">
  {#if data.executions.length === 0}
    <p class="empty">No executions have been recorded yet.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Tool</th>
            <th>Runtime</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Exit</th>
          </tr>
        </thead>
        <tbody>
          {#each data.executions as execution}
            <tr>
              <td>
                <a href={`/executions/${execution.id}`}>
                  <span
                    class:status-success={execution.status === 'succeeded'}
                    class:status-failed={execution.status !== 'succeeded'}
                  >
                    <span class="status-dot"></span>
                    {execution.status}
                  </span>
                </a>
              </td>
              <td><a class="tool-link" href={`/executions/${execution.id}`}>{execution.toolName}</a></td>
              <td><span class="runtime-badge {execution.runtime}">{execution.runtime}</span></td>
              <td>{formatDate(execution.startedAt)}</td>
              <td>{execution.durationMs ?? 0} ms</td>
              <td>{execution.exitCode ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stats article {
    padding: 17px;
  }

  .stats strong,
  .stats span {
    display: block;
  }

  .stats strong {
    font-size: 1.28rem;
  }

  .stats span {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.69rem;
  }

  .table-card {
    overflow: hidden;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.73rem;
  }

  th,
  td {
    padding: 13px 15px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    white-space: nowrap;
  }

  th {
    color: var(--muted);
    background: color-mix(in srgb, var(--surface-solid) 46%, transparent);
    font-size: 0.64rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover {
    background: color-mix(in srgb, var(--accent) 4%, transparent);
  }

  .tool-link {
    color: var(--text);
    font-weight: 840;
  }

  .empty {
    margin: 0;
    padding: 20px;
    color: var(--muted);
    font-size: 0.76rem;
  }

  @media (max-width: 800px) {
    .stats {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
