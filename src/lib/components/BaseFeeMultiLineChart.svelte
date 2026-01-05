<script lang="ts">
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { LineChart } from 'layerchart';
	import { scaleLinear } from 'd3-scale';
	import { curveNatural } from 'd3-shape';

	import RunSeries from '@/components/BaseFeeRunTable.svelte';

	export let runs: RunSeries[] = [];

	// Optional: highlight one series visually (default: last)
	export let activeKey: string = '';

	const toGwei = (wei: bigint) => Number(wei) / 1_000_000_000;

	$: resolvedActiveKey = activeKey || runs.at(-1)?.key || '';

	// Chart config for shadcn tooltip/legend
	$: chartConfig = runs.reduce((acc, r) => {
		acc[r.key] = { label: r.label, color: r.color };
		return acc;
	}, {} as Chart.ChartConfig);

	type Row = { block: number } & Record<string, number | null>;

	// Merge series into a single dataset (block-based)
	$: data = (() => {
		const rows = new Map<number, Row>();

		for (const r of runs) {
			for (const p of r.points) {
				let row = rows.get(p.block);
				if (!row) {
					row = { block: p.block };
					rows.set(p.block, row);
				}
				row[r.key] = toGwei(p.baseFeeWei);
			}
		}

		const blocks = [...rows.keys()].sort((a, b) => a - b);
		for (const b of blocks) {
			const row = rows.get(b)!;
			for (const r of runs) {
				if (!(r.key in row)) row[r.key] = null;
			}
		}
		return blocks.map((b) => rows.get(b)!);
	})();

	function fmt(n: number) {
		return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	}

	function lastGwei(r: RunSeries) {
		const last = r.points.at(-1);
		return last ? toGwei(last.baseFeeWei) : 0;
	}

	// Series styling: active one thicker, others thinner
	$: series = runs.map((r) => ({
		key: r.key,
		label: r.label,
		color: r.color,
		strokeWidth: r.key === resolvedActiveKey ? 3 : 2
	}));

	const xScale = scaleLinear();
</script>

<Card.Root>
	<Card.Header class="flex flex-col items-stretch space-y-0 border-b p-0 sm:flex-row">
		<div class="flex flex-1 flex-col justify-center gap-1 px-6">
			<Card.Title>BaseFee (Simulated)</Card.Title>
			<Card.Description>Compare scenarios. Hover to inspect points.</Card.Description>
		</div>
	</Card.Header>

	<Card.Content class="px-2 sm:p-6">
		{#if runs.length === 0}
			<div class="py-14 text-center text-sm text-muted-foreground">
				Click <span class="font-medium">“Add scenario”</span> to add a series to the chart.
			</div>
		{:else}
			<Chart.Container config={chartConfig} class="aspect-auto h-[280px] w-full pl-24">
				<LineChart
					{data}
					x="block"
					{xScale}
					axis
					legend={true}
					{series}
					props={{
						// Style from the example
						spline: { curve: curveNatural, motion: 'tween', strokeWidth: 2 },
						xAxis: { format: (v: number) => `#${v}` },
						yAxis: {
							format: (v: number) => v.toLocaleString()
						},
						highlight: { points: { r: 4 } }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip />
					{/snippet}
				</LineChart>
			</Chart.Container>
		{/if}
	</Card.Content>
</Card.Root>
