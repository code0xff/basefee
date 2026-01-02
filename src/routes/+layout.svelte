<script lang="ts">
	import { ModeWatcher } from 'mode-watcher';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>BaseFee Tracker</title>
</svelte:head>

<ModeWatcher />

<div class="flex h-screen flex-col">
	{@render children?.()}
</div>
