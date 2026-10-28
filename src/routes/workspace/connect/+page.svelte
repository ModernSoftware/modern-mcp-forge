<script lang="ts">
  import ExternalConnection from '$lib/components/ExternalConnection.svelte';
  let { data } = $props();
</script>

<svelte:head
  ><title>Connect external server · Modern MCP Forge</title></svelte:head
>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">EXTERNAL MCP</div>
    <h1>Connect an external server</h1>
    <p>
      Add its tools, static resources and prompts to this project's MCP
      endpoint.
    </p>
  </div>
</section>
<ExternalConnection
  projectId={data.project.id}
  generation={data.snapshot.generation}
/>
