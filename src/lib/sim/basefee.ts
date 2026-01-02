export type BaseFeeParams = {
	gasLimit: bigint;

	increasingThresholdPct: number; // e.g. 33
	decreasingThresholdPct: number; // e.g. 10
	baseFeeChangeRatePct: number; // e.g. 2

	// initialBaseFeeWei removed:
	// minBaseFeeWei is used as the starting base fee.
	minBaseFeeWei: bigint;
	maxBaseFeeWei: bigint;
};

export type Segment = {
	blocks: number;
	utilizationPct: number;
};

export type SimPoint = {
	block: number;
	gasUsed: bigint;
	gasUsedPct: number;
	baseFeeWei: bigint;
	action: 'inc' | 'dec' | 'hold';
};

function clampNum(n: number, lo = 0, hi = 100) {
	return Math.max(lo, Math.min(hi, n));
}

function clampBig(v: bigint, lo: bigint, hi: bigint) {
	if (v < lo) return lo;
	if (v > hi) return hi;
	return v;
}

function applyRate(baseFee: bigint, ratePct: number, dir: 'inc' | 'dec'): bigint {
	const r = BigInt(Math.floor(ratePct * 100));
	const mul = dir === 'inc' ? 10_000n + r : 10_000n - r;
	return (baseFee * mul) / 10_000n;
}

export function expandSegments(segments: Segment[]): number[] {
	const seq: number[] = [];
	for (const s of segments) {
		const blocks = Math.max(0, Math.floor(s.blocks));
		const pct = clampNum(Number(s.utilizationPct));
		for (let i = 0; i < blocks; i++) seq.push(pct);
	}
	return seq;
}
export function simulateBaseFee(params: BaseFeeParams, segments: Segment[]): SimPoint[] {
	const gasLimit = params.gasLimit === 0n ? 1n : params.gasLimit;

	const incTh = clampNum(params.increasingThresholdPct);
	const decTh = clampNum(params.decreasingThresholdPct);
	const rate = Math.max(0, params.baseFeeChangeRatePct);

	// Start from minBaseFeeWei
	let baseFee = clampBig(params.minBaseFeeWei, params.minBaseFeeWei, params.maxBaseFeeWei);

	const gasPctSeq = expandSegments(segments);
	const points: SimPoint[] = [];

	// ✅ block 0: initial state, no adjustment
	if (gasPctSeq.length > 0) {
		const gasUsedPct = gasPctSeq[0];
		const gasUsed = (gasLimit * BigInt(gasUsedPct)) / 100n;

		points.push({
			block: 0,
			gasUsed,
			gasUsedPct,
			baseFeeWei: baseFee,
			action: 'hold'
		});
	}

	// ✅ block i (i >= 1): apply adjustment based on previous block
	for (let i = 1; i < gasPctSeq.length; i++) {
		const prevGasUsedPct = gasPctSeq[i - 1];
		const gasUsedPct = gasPctSeq[i];
		const gasUsed = (gasLimit * BigInt(gasUsedPct)) / 100n;

		let action: SimPoint['action'] = 'hold';

		if (prevGasUsedPct > incTh) {
			baseFee = applyRate(baseFee, rate, 'inc');
			action = 'inc';
		} else if (prevGasUsedPct < decTh) {
			baseFee = applyRate(baseFee, rate, 'dec');
			action = 'dec';
		}

		baseFee = clampBig(baseFee, params.minBaseFeeWei, params.maxBaseFeeWei);

		points.push({
			block: i,
			gasUsed,
			gasUsedPct,
			baseFeeWei: baseFee,
			action
		});
	}

	return points;
}
