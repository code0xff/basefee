<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import type { SimPoint } from '$lib/sim/basefee';

	export type RunSeries = {
		key: string;
		label: string;
		color: string;
		points: SimPoint[];
	};

	export let runs: RunSeries[] = [];
	export let selectedKey: string = '';

	// Pagination
	export let pageSize = 500;

	let page = 1; // 1-based for UI

	// Formatting toggle (local state)
	let showDecimals = true;
	let maxFractionDigits = 3;

	const toGwei = (wei: bigint) => Number(wei) / 1_000_000_000;

	$: selectedRun = runs.find((r) => r.key === selectedKey) ?? runs[0];
	$: totalRows = selectedRun?.points.length ?? 0;

	$: safePageSize = Math.max(1, Math.floor(pageSize));
	$: totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));

	// Reset to page 1 when scenario changes
	$: if (selectedKey) {
		page = 1;
	}

	// Clamp page if rows/page size changes
	$: if (page > totalPages) page = totalPages;
	$: if (page < 1) page = 1;

	$: startIdx = (page - 1) * safePageSize;
	$: endIdx = Math.min(totalRows, startIdx + safePageSize);

	$: rows = (() => {
		const pts = selectedRun?.points ?? [];
		return pts.slice(startIdx, endIdx);
	})();

	$: formatBaseFee = (() => {
		const digits = Math.max(0, Math.floor(maxFractionDigits));
		return (gwei: number) => {
			if (!showDecimals) return Math.round(gwei).toLocaleString();
			return gwei.toLocaleString(undefined, { maximumFractionDigits: digits });
		};
	})();

	function goto(p: number) {
		const next = Math.max(1, Math.min(totalPages, Math.floor(p)));
		page = next;
	}

	let pageInput = '1';
	$: pageInput = String(page);

	function escapeCsv(v: string) {
		if (/[,"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
		return v;
	}

	function downloadCsv(filename: string, csv: string) {
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportSelectedRunCsv() {
		const run = selectedRun;
		if (!run) return;

		const header = ['block', 'gasUsedPct', 'baseFeeGwei', 'action'];

		const digits = Math.max(0, Math.floor(maxFractionDigits));
		const lines = [
			header.join(','),
			...run.points.map((p) => {
				const baseFeeGwei = toGwei(p.baseFeeWei);
				const baseFeeOut = showDecimals
					? baseFeeGwei.toFixed(digits)
					: String(Math.round(baseFeeGwei));

				return [String(p.block), p.gasUsedPct.toFixed(0), baseFeeOut, p.action]
					.map(escapeCsv)
					.join(',');
			})
		].join('\n');

		const safeLabel = (run.label || run.key).replace(/[^\w.-]+/g, '_');
		downloadCsv(`basefee_${safeLabel}_all.csv`, lines);
	}
</script>

{#if !selectedRun}
	<div class="py-10 text-center text-sm text-muted-foreground">No scenario selected.</div>
{:else}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Badge style={`background:${selectedRun.color}; color: white;`}>{selectedRun.label}</Badge>
			<div class="text-xs text-muted-foreground">
				Rows: {totalRows.toLocaleString()} · Showing {startIdx.toLocaleString()}–{(
					endIdx - 1
				).toLocaleString()}
			</div>
		</div>

		<div class="flex items-center gap-2">
			<div class="text-xs text-muted-foreground">BaseFee format</div>
			<Button
				type="button"
				variant={showDecimals ? 'secondary' : 'outline'}
				class="h-8 px-3 text-xs"
				onclick={() => (showDecimals = !showDecimals)}
			>
				{showDecimals ? 'Decimals: ON' : 'Decimals: OFF'}
			</Button>
			{#if showDecimals}
				<span class="text-xs text-muted-foreground"
					>(max {Math.max(0, Math.floor(maxFractionDigits))} dp)</span
				>
			{/if}
		</div>
	</div>

	<!-- Pagination controls -->
	<div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
		<div class="flex items-center gap-2">
			<Button
				type="button"
				variant="secondary"
				class="h-8 px-3"
				disabled={page <= 1}
				onclick={() => goto(page - 1)}
			>
				Prev
			</Button>
			<Button
				type="button"
				variant="secondary"
				class="h-8 px-3"
				disabled={page >= totalPages}
				onclick={() => goto(page + 1)}
			>
				Next
			</Button>

			<div class="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
				Page
				<div class="w-[84px]">
					<Input
						class="h-8"
						value={pageInput}
						inputmode="numeric"
						onkeydown={(e) => {
							if (e.key === 'Enter') goto(Number((e.currentTarget as HTMLInputElement).value));
						}}
						onblur={(e) => goto(Number((e.currentTarget as HTMLInputElement).value))}
						oninput={(e) => (pageInput = (e.currentTarget as HTMLInputElement).value)}
					/>
				</div>
				/ {totalPages.toLocaleString()}
			</div>
		</div>

		<div class="flex items-center gap-2">
			<div class="text-xs text-muted-foreground">Page size: {safePageSize.toLocaleString()}</div>
			<Button
				type="button"
				variant="outline"
				class="h-8 px-3 text-xs"
				onclick={exportSelectedRunCsv}
			>
				Export CSV
			</Button>
		</div>
	</div>

	<div class="mt-3 max-h-[520px] overflow-auto rounded-lg border">
		<table class="w-full text-sm">
			<thead class="sticky top-0 bg-background">
				<tr class="border-b">
					<th class="px-3 py-2 text-left font-medium">Block</th>
					<th class="px-3 py-2 text-right font-medium">GasUsed (%)</th>
					<th class="px-3 py-2 text-right font-medium">BaseFee (gwei)</th>
					<th class="px-3 py-2 text-center font-medium">Action</th>
				</tr>
			</thead>

			<tbody>
				{#each rows as p (p.block)}
					<tr class="border-b last:border-b-0 hover:bg-muted/40">
						<td class="px-3 py-2">{p.block}</td>
						<td class="px-3 py-2 text-right">{p.gasUsedPct.toFixed(0)}</td>
						<td class="px-3 py-2 text-right">{formatBaseFee(toGwei(p.baseFeeWei))}</td>
						<td class="px-3 py-2 text-center">
							{#if p.action === 'inc'}
								<Badge class="bg-emerald-600 text-white">inc</Badge>
							{:else if p.action === 'dec'}
								<Badge class="bg-sky-600 text-white">dec</Badge>
							{:else}
								<Badge variant="secondary">hold</Badge>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
