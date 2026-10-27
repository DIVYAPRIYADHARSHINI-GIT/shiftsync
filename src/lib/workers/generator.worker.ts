// Web Worker that runs the roster generator off the main thread, so the page never
// freezes. Reports progress, honours Cancel, and enforces a wall-clock safety stop.

import { generateRoster, type GenerateOptions, type GenerateResult } from '../logic/generator';

export interface WorkerRequest {
	type: 'generate';
	/** Everything the generator needs, minus the injected callbacks. */
	options: Omit<GenerateOptions, 'onProgress' | 'shouldCancel' | 'nowMs'>;
}

export type WorkerResponse =
	| { type: 'progress'; fraction: number }
	| { type: 'done'; result: GenerateResult }
	| { type: 'error'; message: string };

let cancelled = false;

self.onmessage = (event: MessageEvent<WorkerRequest | { type: 'cancel' }>) => {
	const data = event.data;

	if (data.type === 'cancel') {
		cancelled = true;
		return;
	}

	if (data.type !== 'generate') return;
	cancelled = false;

	try {
		let lastReported = -1;
		const result = generateRoster({
			...data.options,
			onProgress: (fraction) => {
				// Throttle to whole percent so the worker is not flooded with messages.
				const pct = Math.floor(fraction * 100);
				if (pct !== lastReported) {
					lastReported = pct;
					(self as unknown as Worker).postMessage({
						type: 'progress',
						fraction
					} satisfies WorkerResponse);
				}
			},
			shouldCancel: () => cancelled
		});
		(self as unknown as Worker).postMessage({ type: 'done', result } satisfies WorkerResponse);
	} catch (error) {
		(self as unknown as Worker).postMessage({
			type: 'error',
			message: error instanceof Error ? error.message : 'The generator stopped unexpectedly.'
		} satisfies WorkerResponse);
	}
};
