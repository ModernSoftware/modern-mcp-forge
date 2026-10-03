<script lang="ts">
  import type { ProjectSourceManager } from '$lib/server/sources/manager';
  let { sources, kind } = $props<{
    sources: ReturnType<ProjectSourceManager['snapshot']>['sources'];
    kind: 'tools' | 'resources' | 'prompts';
  }>();
</script>

<section class="native-list">
  <div class="heading">
    <h2>Native {kind}</h2>
    <a href="/project">Add or manage native sources →</a>
  </div>
  {#each sources as source (source.id)}
    {#each source.catalog[kind] as capability (capability.name)}
      <a
        class="glass-card capability"
        href={`/project/native/${encodeURIComponent(source.id)}`}
      >
        <strong>{capability.name}</strong><span
          >{source.id} · {source.status} · MCPack</span
        >
        <p>{capability.description ?? 'Edit and test native capability'}</p>
      </a>
    {/each}
  {/each}
</section>

<style>
  .native-list {
    margin-bottom: 24px;
  }
  .heading {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-size: 1rem;
  }
  a {
    color: var(--accent);
    font-size: 0.8rem;
  }
  .capability {
    display: block;
    padding: 16px;
    margin-bottom: 10px;
    color: var(--text);
  }
  span {
    margin-left: 14px;
    color: var(--muted);
  }
  p {
    margin-bottom: 0;
  }
</style>
