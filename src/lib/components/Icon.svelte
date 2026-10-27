<script lang="ts" module>
	// One custom SVG icon set. 20 px grid, 1.5 px stroke, rounded joins, no emoji.
	// Every path is drawn on the same 20x20 box so icons align across the app.
	export type IconName =
		| 'logo'
		| 'roster'
		| 'staff'
		| 'shifts'
		| 'leave'
		| 'swaps'
		| 'hours'
		| 'reports'
		| 'settings'
		| 'info'
		| 'chevron-left'
		| 'chevron-right'
		| 'chevron-down'
		| 'chevron-up'
		| 'calendar'
		| 'clock'
		| 'check'
		| 'close'
		| 'plus'
		| 'minus'
		| 'lock'
		| 'unlock'
		| 'alert'
		| 'warning'
		| 'error'
		| 'success'
		| 'search'
		| 'menu'
		| 'more'
		| 'edit'
		| 'trash'
		| 'copy'
		| 'download'
		| 'upload'
		| 'undo'
		| 'redo'
		| 'generate'
		| 'publish'
		| 'grid'
		| 'list'
		| 'chart'
		| 'sun'
		| 'moon'
		| 'shield'
		| 'drag'
		| 'person'
		| 'filter'
		| 'sort'
		| 'print'
		| 'link'
		| 'cancel'
		| 'history'
		| 'density';

	const PATHS: Record<IconName, string> = {
		// A two-arrow clock: the ShiftSync mark.
		logo: 'M10 5.5v4.75l3 1.75M16.5 10a6.5 6.5 0 0 1-11.1 4.6M3.5 10a6.5 6.5 0 0 1 11.1-4.6M14.6 5.4V2.8M14.6 5.4h-2.6M5.4 14.6v2.6M5.4 14.6H8',
		roster: 'M3 5.5h14M3 10h14M3 14.5h14M7.5 3v14M12.5 3v14',
		staff: 'M7 9a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 7 9ZM2.6 16.4c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4M13.4 8.6a2.2 2.2 0 1 0 0-4.4M14.5 12.6c1.8.3 3 1.8 3 3.8',
		shifts: 'M4 3.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM3 7.5h14M6.5 2v3M13.5 2v3M6.5 11h3M6.5 14h7',
		leave: 'M4 3.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM3 7.5h14M6.5 2v3M13.5 2v3M7.5 12.5l1.8 1.8L13 10.6',
		swaps: 'M3.5 7h11.5M12 4l3 3-3 3M16.5 13H5M8 10l-3 3 3 3',
		hours: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM10 6.2V10l2.6 1.6',
		reports: 'M4.5 16.5V9M8.2 16.5V4.5M11.8 16.5v-5M15.5 16.5V7.2M2.8 16.5h14.4',
		settings:
			'M10 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM16.2 12.2a1.3 1.3 0 0 0 .26 1.44l.05.05a1.6 1.6 0 1 1-2.26 2.26l-.05-.05a1.3 1.3 0 0 0-1.44-.26 1.3 1.3 0 0 0-.79 1.19v.13a1.6 1.6 0 1 1-3.2 0v-.07a1.3 1.3 0 0 0-.85-1.19 1.3 1.3 0 0 0-1.44.26l-.05.05a1.6 1.6 0 1 1-2.26-2.26l.05-.05a1.3 1.3 0 0 0 .26-1.44 1.3 1.3 0 0 0-1.19-.79h-.13a1.6 1.6 0 1 1 0-3.2h.07a1.3 1.3 0 0 0 1.19-.85 1.3 1.3 0 0 0-.26-1.44l-.05-.05a1.6 1.6 0 1 1 2.26-2.26l.05.05a1.3 1.3 0 0 0 1.44.26h.06a1.3 1.3 0 0 0 .79-1.19v-.13a1.6 1.6 0 1 1 3.2 0v.07a1.3 1.3 0 0 0 .79 1.19 1.3 1.3 0 0 0 1.44-.26l.05-.05a1.6 1.6 0 1 1 2.26 2.26l-.05.05a1.3 1.3 0 0 0-.26 1.44v.06a1.3 1.3 0 0 0 1.19.79h.13a1.6 1.6 0 1 1 0 3.2h-.07a1.3 1.3 0 0 0-1.19.79Z',
		info: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM10 13.4V9.4M10 6.9h.01',
		'chevron-left': 'M12.5 4.5 7 10l5.5 5.5',
		'chevron-right': 'M7.5 4.5 13 10l-5.5 5.5',
		'chevron-down': 'M4.5 7.5 10 13l5.5-5.5',
		'chevron-up': 'M4.5 12.5 10 7l5.5 5.5',
		calendar: 'M4 4.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1ZM3 8.5h14M6.5 3v3M13.5 3v3',
		clock: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM10 6.4V10l2.4 1.4',
		check: 'M4.5 10.5 8 14l7.5-8',
		close: 'M5 5l10 10M15 5 5 15',
		plus: 'M10 4.5v11M4.5 10h11',
		minus: 'M4.5 10h11',
		lock: 'M5.5 8.8h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM7 8.8V6.4a3 3 0 1 1 6 0v2.4',
		unlock: 'M5.5 8.8h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM7 8.8V6.4a3 3 0 0 1 5.6-1.5',
		alert: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM10 6.8v4M10 13.4h.01',
		warning: 'M8.7 3.6 2.3 14.6a1.5 1.5 0 0 0 1.3 2.3h12.8a1.5 1.5 0 0 0 1.3-2.3L11.3 3.6a1.5 1.5 0 0 0-2.6 0ZM10 7.8v3.4M10 14h.01',
		error: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM12.2 7.8 7.8 12.2M7.8 7.8l4.4 4.4',
		success: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM7 10.2l2 2 4-4.4',
		search: 'M9.2 15a5.8 5.8 0 1 0 0-11.6 5.8 5.8 0 0 0 0 11.6ZM16.5 16.5l-3.2-3.2',
		menu: 'M3 6h14M3 10h14M3 14h14',
		more: 'M10 6.2h.01M10 10h.01M10 13.8h.01',
		edit: 'M13.2 3.6a1.8 1.8 0 0 1 2.5 2.5l-8.3 8.3-3.3.8.8-3.3 8.3-8.3ZM12 5l3 3',
		trash: 'M3.5 5.5h13M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M5.5 5.5 6 16a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l.5-10.5M8.5 8.5v5M11.5 8.5v5',
		copy: 'M7.5 7.5h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM4 12.5h-.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V4',
		download: 'M10 3v9M6.2 8.8 10 12.5l3.8-3.7M3.5 16.5h13',
		upload: 'M10 12.5v-9M6.2 6.7 10 3l3.8 3.7M3.5 16.5h13',
		undo: 'M7 6.5 3.5 10 7 13.5M3.5 10h8.2a4.8 4.8 0 1 1 0 9.6',
		redo: 'M13 6.5 16.5 10 13 13.5M16.5 10H8.3a4.8 4.8 0 1 0 0 9.6',
		generate: 'M10 2.8v3M10 14.2v3M4.9 4.9l2.1 2.1M13 13l2.1 2.1M2.8 10h3M14.2 10h3M4.9 15.1 7 13M13 7l2.1-2.1',
		publish: 'M10 16.5V5M5.8 9.2 10 5l4.2 4.2M4 3h12',
		grid: 'M3.5 3.5h5.5v5.5H3.5zM11 3.5h5.5v5.5H11zM3.5 11h5.5v5.5H3.5zM11 11h5.5v5.5H11z',
		list: 'M7 5.5h10M7 10h10M7 14.5h10M3.5 5.5h.01M3.5 10h.01M3.5 14.5h.01',
		chart: 'M3 16.5h14M5.5 16.5v-5M9.2 16.5V7M12.8 16.5v-7M16.5 16.5V4.5',
		sun: 'M10 13.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM10 2.5v1.8M10 15.7v1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M2.5 10h1.8M15.7 10h1.8M4.7 15.3 6 14M14 6l1.3-1.3',
		moon: 'M16.5 11.4A7 7 0 0 1 8.6 3.5a7 7 0 1 0 7.9 7.9Z',
		shield: 'M10 3 4.5 5.2v4.4c0 3.3 2.3 6.3 5.5 7.2 3.2-.9 5.5-3.9 5.5-7.2V5.2L10 3ZM7.8 10l1.6 1.6 3-3.3',
		drag: 'M7.5 5.5h.01M12.5 5.5h.01M7.5 10h.01M12.5 10h.01M7.5 14.5h.01M12.5 14.5h.01',
		person: 'M10 9.8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-2.8 2.7-4.8 6-4.8s6 2 6 4.8',
		filter: 'M3 4.5h14l-5.3 6v5l-3.4 1.8v-6.8L3 4.5Z',
		sort: 'M6 4.5v11M3.2 12.7 6 15.5l2.8-2.8M14 15.5v-11M11.2 7.3 14 4.5l2.8 2.8',
		print: 'M6 7.5V3.5h8v4M6 15h8v2.5H6zM5 7.5h10a1.5 1.5 0 0 1 1.5 1.5v4h-3v-2h-7v2h-3V9A1.5 1.5 0 0 1 5 7.5Z',
		link: 'M8.3 11.7a2.8 2.8 0 0 0 4.2.3l2.5-2.5a2.8 2.8 0 1 0-4-4l-1.4 1.4M11.7 8.3a2.8 2.8 0 0 0-4.2-.3L5 10.5a2.8 2.8 0 1 0 4 4l1.4-1.4',
		cancel: 'M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6ZM5.4 5.4l9.2 9.2',
		history: 'M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.4 4v3.4h3.4M10 6.5V10l2.5 1.5',
		density: 'M3 4.5h14M3 8h14M3 12h14M3 15.5h14'
	};

	export const ICON_NAMES = Object.keys(PATHS) as IconName[];
	export { PATHS };
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		/** Accessible label. Omit for a purely decorative icon beside visible text. */
		label?: string;
		class?: string;
	}
	let { name, size = 20, label, class: className = '' }: Props = $props();
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 20 20"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	focusable="false"
>
	{#if label}<title>{label}</title>{/if}
	<path d={PATHS[name]} />
</svg>
