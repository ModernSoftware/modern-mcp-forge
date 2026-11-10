<script lang="ts">
  import SourceConnection from '$lib/components/SourceConnection.svelte';
  import { page } from '$app/state';
  let bridge = $derived(page.url.searchParams.get('kind') === 'bridge');
  let { data } = $props();
</script>

<svelte:head
  ><title
    >{bridge ? 'Attach bridge' : 'Connect external server'} · Modern MCP Forge</title
  ></svelte:head
>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">{bridge ? 'LOCAL STDIO' : 'EXTERNAL MCP'}</div>
    <h1>{bridge ? 'Bridge an existing implementation' : 'Connect an external server'}</h1>
    <p>
      Add its tools, static resources and prompts to this project's MCP
      endpoint.
    </p>
  </div>
</section>
{#key bridge}<SourceConnection
    kind={bridge ? 'bridge' : 'external'}
    projectId={data.project.id}
    projectPath={data.project.path}
    generation={data.snapshot.generation}
  />{/key}
