<!-- +page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	import * as Select from '$lib/components/ui/select/index.js';

	import BaseFeeMultiLineChart from '@/components/BaseFeeMultiLineChart.svelte';
	import BaseFeeRunTable, { type RunSeries } from '@/components/BaseFeeRunTable.svelte';

	import { simulateBaseFee, type BaseFeeParams, type Segment } from '$lib/sim/basefee';

	/* ---------------- params ---------------- */

	let params: BaseFeeParams = {
		gasLimit: 63_000_000n,
		increasingThresholdPct: 33,
		decreasingThresholdPct: 10,
		baseFeeChangeRatePct: 2,
		minBaseFeeWei: 1_000_000_000_000n,
		maxBaseFeeWei: 5_000_000_000_000_000n,

		// ✅ add
		strategy: 'linear',
		k: 4
	};

	let segments: Segment[] = [
		{ blocks: 500, utilizationPct: 60 },
		{ blocks: 200, utilizationPct: 20 },
		{ blocks: 500, utilizationPct: 5 }
	];

	/* ---------------- runs ---------------- */

	let runs: RunSeries[] = [];
	let selectedRunKey = '';
	let selectedRunLabel = '';

	const palette = ['green', 'blue', 'red', 'orange', 'purple', 'teal', 'brown', 'black'];
	let paletteIdx = 0;

	function simulate() {
		return simulateBaseFee(params, segments);
	}

	function addRunToChart() {
		const points = simulate();
		const key = `run_${runs.length + 1}`;
		const color = palette[paletteIdx++ % palette.length];

		runs = [...runs, { key, label: `S#${runs.length + 1}`, color, points }];
		selectedRunKey = key;
	}

	function clearRuns() {
		runs = [];
		paletteIdx = 0;
		selectedRunKey = '';
	}

	/* ---------------- utils ---------------- */

	const toNum = (v: string, fb: number) => (Number.isFinite(+v) ? +v : fb);
	const toBig = (v: string, fb: bigint) => {
		try {
			return BigInt(v);
		} catch {
			return fb;
		}
	};

	/* ---------------- segments / total blocks ---------------- */

	function addSegment() {
		segments = [...segments, { blocks: 100, utilizationPct: 70 }];
	}

	function removeSegment(i: number) {
		segments = segments.filter((_, idx) => idx !== i);
	}

	function updateSegment(i: number, patch: Partial<Segment>) {
		segments = segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
	}

	$: segmentRanges = (() => {
		let cursor = 0;
		return segments.map((s) => {
			const start = cursor;
			const len = Math.max(0, Math.floor(s.blocks));
			cursor += len;
			return { start, end: cursor - 1, len };
		});
	})();

	$: currentTotalBlocks =
		segmentRanges.length > 0 ? segmentRanges.at(-1)!.start + segmentRanges.at(-1)!.len : 0;

	let totalBlocksInput = 0;
	let totalBlocksDirty = false;

	$: if (!totalBlocksDirty) totalBlocksInput = currentTotalBlocks;

	function setTotalBlocks(next: number) {
		next = Math.max(0, Math.floor(next));
		let delta = next - currentTotalBlocks;
		if (delta === 0) return;

		if (delta > 0) {
			const last = segments.at(-1)!;
			updateSegment(segments.length - 1, { blocks: last.blocks + delta });
			return;
		}

		let remain = -delta;
		const nextSegs = segments.map((s) => ({ ...s }));

		for (let i = nextSegs.length - 1; i >= 0 && remain > 0; i--) {
			const cut = Math.min(nextSegs[i].blocks, remain);
			nextSegs[i].blocks -= cut;
			remain -= cut;
		}

		segments = nextSegs;
	}

	/* ---------------- derived ---------------- */

	$: if (runs.length > 0 && !selectedRunKey) selectedRunKey = runs[0].key;
	$: selectedRunLabel = runs.find((r) => r.key === selectedRunKey)?.label ?? 'Select scenario';

	onMount(addRunToChart);
</script>

<div class="space-y-4 p-6">
	<div class="grid grid-cols-12 gap-4">
		<!-- CONTROLS -->
		<div class="col-span-12 space-y-4 lg:col-span-4 xl:col-span-3">
			<Card>
				<CardHeader><CardTitle>Controls</CardTitle></CardHeader>

				<CardContent class="space-y-4">
					<div class="space-y-4">
						<!-- GasLimit -->
						<div class="space-y-1">
							<div class="text-sm whitespace-nowrap text-muted-foreground">GasLimit</div>
							<Input
								class="w-full"
								value={params.gasLimit.toString()}
								oninput={(e) =>
									(params = {
										...params,
										gasLimit: toBig(e.currentTarget.value, params.gasLimit)
									})}
							/>
						</div>

						<!-- Total blocks -->
						<div class="space-y-1">
							<div class="flex items-center justify-between gap-2">
								<div class="text-sm whitespace-nowrap text-muted-foreground">Total blocks</div>
								<Button
									size="sm"
									variant="secondary"
									class="shrink-0"
									disabled={!totalBlocksDirty}
									onclick={() => (totalBlocksDirty = false)}
								>
									Sync
								</Button>
							</div>

							<Input
								class="w-full"
								type="number"
								value={totalBlocksInput}
								oninput={(e) => {
									totalBlocksDirty = true;
									const v = toNum(e.currentTarget.value, totalBlocksInput);
									totalBlocksInput = v;
									setTotalBlocks(v);
								}}
							/>

							<div class="flex items-center gap-2 text-xs text-muted-foreground">
								<span class="whitespace-nowrap">Current</span>
								<Badge class="align-middle">{currentTotalBlocks}</Badge>
								{#if totalBlocksDirty}
									<span class="whitespace-nowrap">Manual override</span>
								{/if}
							</div>
						</div>

						<!-- ✅ Strategy -->
						<div class="space-y-1">
							<div class="text-sm whitespace-nowrap text-muted-foreground">Strategy</div>

							<Select.Root
								type="single"
								value={params.strategy}
								onValueChange={(v) => (params = { ...params, strategy: v as any })}
							>
								<Select.Trigger class="w-full" placeholder="Select a strategy">{params.strategy}</Select.Trigger>

								<Select.Content>
									<Select.Item value="linear">Linear (Simple)</Select.Item>
									<Select.Item value="weighted-quadratic">Weighted Quadratic</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>

						<!-- ✅ K (only for weighted-quadratic) -->
						{#if params.strategy === 'weighted-quadratic'}
							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">K (weight)</div>
								<Input
									class="w-full"
									type="number"
									value={params.k}
									oninput={(e) =>
										(params = { ...params, k: toNum(e.currentTarget.value, params.k) })}
								/>
							</div>
						{/if}

						<!-- Thresholds / rate -->
						<div class="grid grid-cols-1 gap-3">
							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">
									Increasing threshold (%)
								</div>
								<Input
									class="w-full"
									type="number"
									value={params.increasingThresholdPct}
									oninput={(e) =>
										(params = {
											...params,
											increasingThresholdPct: toNum(e.currentTarget.value, 33)
										})}
								/>
							</div>

							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">
									Decreasing threshold (%)
								</div>
								<Input
									class="w-full"
									type="number"
									value={params.decreasingThresholdPct}
									oninput={(e) =>
										(params = {
											...params,
											decreasingThresholdPct: toNum(e.currentTarget.value, 10)
										})}
								/>
							</div>

							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">
									BaseFee change rate (%)
								</div>
								<Input
									class="w-full"
									type="number"
									value={params.baseFeeChangeRatePct}
									oninput={(e) =>
										(params = {
											...params,
											baseFeeChangeRatePct: toNum(e.currentTarget.value, 2)
										})}
								/>
							</div>
						</div>

						<!-- Min/Max -->
						<div class="grid grid-cols-1 gap-3">
							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">
									Start/Min base fee (gwei)
								</div>
								<Input
									class="w-full"
									type="number"
									value={Number(params.minBaseFeeWei / 1_000_000_000n)}
									oninput={(e) =>
										(params = {
											...params,
											minBaseFeeWei: BigInt(toNum(e.currentTarget.value, 0)) * 1_000_000_000n
										})}
								/>
							</div>

							<div class="space-y-1">
								<div class="text-sm whitespace-nowrap text-muted-foreground">
									Max base fee (gwei)
								</div>
								<Input
									class="w-full"
									type="number"
									value={Number(params.maxBaseFeeWei / 1_000_000_000n)}
									oninput={(e) =>
										(params = {
											...params,
											maxBaseFeeWei: BigInt(toNum(e.currentTarget.value, 0)) * 1_000_000_000n
										})}
								/>
							</div>
						</div>
					</div>

					<!-- Segments -->
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium">Segments</span>
							<Button size="sm" variant="secondary" onclick={addSegment}>Add</Button>
						</div>

						{#each segments as s, i}
							<div class="space-y-2 rounded border p-2">
								<div class="flex items-center justify-between text-xs text-muted-foreground">
									<span class="whitespace-nowrap">
										#{i + 1} ({segmentRanges[i].start}~{segmentRanges[i].end})
									</span>
									<Button
										size="sm"
										variant="ghost"
										class="shrink-0"
										onclick={() => removeSegment(i)}
									>
										✕
									</Button>
								</div>

								<div class="grid grid-cols-1 gap-2">
									<div class="space-y-1">
										<div class="text-sm whitespace-nowrap text-muted-foreground">Blocks</div>
										<Input
											class="w-full"
											type="number"
											value={s.blocks}
											oninput={(e) =>
												updateSegment(i, { blocks: toNum(e.currentTarget.value, s.blocks) })}
										/>
									</div>

									<div class="space-y-1">
										<div class="text-sm whitespace-nowrap text-muted-foreground">
											Utilization (%)
										</div>
										<Input
											class="w-full"
											type="number"
											value={s.utilizationPct}
											oninput={(e) =>
												updateSegment(i, {
													utilizationPct: Math.min(
														100,
														Math.max(0, toNum(e.currentTarget.value, s.utilizationPct))
													)
												})}
										/>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		</div>

		<!-- CHART + TABLE -->
		<div class="col-span-12 space-y-4 lg:col-span-8 xl:col-span-9">
			<Card>
				<CardHeader class="flex items-center justify-between">
					<CardTitle>BaseFee (Simulated)</CardTitle>
					<div class="flex gap-2">
						<Button size="sm" onclick={addRunToChart}>Add scenario</Button>
						<Button size="sm" variant="destructive" onclick={clearRuns}>Clear</Button>
					</div>
				</CardHeader>

				<CardContent>
					{#if runs.length === 0}
						<div class="py-14 text-center text-sm text-muted-foreground">
							Click <span class="font-medium">“Add scenario”</span> to add a series to the chart.
						</div>
					{:else}
						<BaseFeeMultiLineChart {runs} />
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex items-center justify-between">
					<CardTitle>Per-block Table</CardTitle>

					<Select.Root type="single" bind:value={selectedRunKey}>
						<Select.Trigger class="w-[220px]" placeholder="Select a scenario">
							{selectedRunLabel}
						</Select.Trigger>
						<Select.Content class="w-[220px]">
							{#each runs as r (r.key)}
								<Select.Item value={String(r.key)}>
									{r.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</CardHeader>

				<CardContent>
					<BaseFeeRunTable {runs} selectedKey={selectedRunKey} pageSize={500} />
				</CardContent>
			</Card>
		</div>
	</div>
</div>
