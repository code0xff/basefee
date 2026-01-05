// basefee.ts

export type BaseFeeStrategy = 'linear' | 'weighted-quadratic';

export type BaseFeeParams = {
	gasLimit: bigint;

	increasingThresholdPct: number; // e.g. 33
	decreasingThresholdPct: number; // e.g. 10
	baseFeeChangeRatePct: number; // e.g. 2

	// initialBaseFeeWei removed:
	// minBaseFeeWei is used as the starting base fee.
	minBaseFeeWei: bigint;
	maxBaseFeeWei: bigint;

	// ✅ Strategy selection
	strategy: BaseFeeStrategy;

	// ✅ Weight (used by weighted-quadratic)
	k: number; // e.g. 0 ~ 10
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

/**
 * Apply a delta percent directly to baseFee.
 * - deltaPct is a percentage value, e.g. +2.5 means +2.5%
 * - Uses basis points (0.01%) quantization for determinism.
 */
function applyDeltaPct(baseFee: bigint, deltaPct: number): bigint {
	// 1bp = 0.01%
	const bp = BigInt(Math.floor(deltaPct * 100)); // quantize to 0.01%
	const mul = 10_000n + bp; // 100% = 10_000
	return (baseFee * mul) / 10_000n;
}

function normalizeRatePct(v: number) {
	return Math.max(0, Number.isFinite(v) ? v : 0);
}

function normalizeK(v: number) {
	return Math.max(0, Number.isFinite(v) ? v : 0);
}

/**
 * Compute deltaPct and action based on *previous block* utilization (prevGasUsedPct).
 * This matches the simulator's design: block i baseFee depends on block i-1 utilization.
 */
function calcDeltaPct(
	prevGasUsedPct: number,
	params: BaseFeeParams
): { deltaPct: number; action: SimPoint['action'] } {
	const incTh = clampNum(params.increasingThresholdPct);
	const decTh = clampNum(params.decreasingThresholdPct);
	const rate = normalizeRatePct(params.baseFeeChangeRatePct);

	// Dead band: no change
	if (prevGasUsedPct <= incTh && prevGasUsedPct >= decTh) {
		return { deltaPct: 0, action: 'hold' };
	}

	if (params.strategy === 'linear') {
		if (prevGasUsedPct > incTh) return { deltaPct: +rate, action: 'inc' };
		return { deltaPct: -rate, action: 'dec' };
	} else {
		// if gasUsedPct > IncreasingThreshold:
		//  over = (gasUsedPct - IncreasingThreshold) / (100 - IncreasingThreshold) // over : 0~1
		//  deltaPct = + BaseFeeChangeRate * (1 + K * over^2)

		// else if gasUsedPct < DecreasingThreshold:
		//  under = (DecreasingThreshold - gasUsedPct) / DecreasingThreshold // under : 0~1
		//  deltaPct = - BaseFeeChangeRate * (1 + K * under^2) // K : 가중치계수

		// else:
		//  deltaPct = 0  // Dead Band: 10~33% 변동 없음

		// newBaseFee = parentBaseFee * (1 + deltaPct/100)

		const K = normalizeK(params.k);

		if (prevGasUsedPct > incTh) {
			const over = (prevGasUsedPct - incTh) / (100 - incTh); // 0~1
			const deltaPct = +rate * (1 + K * over ** 2);
			return { deltaPct, action: 'inc' };
		} else {
			// prevGasUsedPct < decTh
			const under = (decTh - prevGasUsedPct) / decTh; // 0~1
			const deltaPct = -rate * (1 + K * under ** 2);
			return { deltaPct, action: 'dec' };
		}
	}
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

		const { deltaPct, action } = calcDeltaPct(prevGasUsedPct, params);

		if (deltaPct !== 0) {
			baseFee = applyDeltaPct(baseFee, deltaPct);
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
