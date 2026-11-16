<script lang="ts">
  import NamedCases from '$lib/components/NamedCases.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Named test cases · {data.project.name}</title></svelte:head>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">{data.project.name}</div>
    <h1>Named test cases</h1>
    <p>
      Run saved checks and review tools that changed since a case was saved.
    </p>
  </div>
</section>
{#key data.project.id}<NamedCases
    projectId={data.project.id}
    generation={data.snapshot.generation}
  />{/key}
