<script lang="ts">
	/* eslint-disable svelte/no-at-html-tags */

	import {
		resolveTypstOptions,
		type TypstInputMode,
		type TypstMode,
		type TypstSvgSanitizer
	} from './config.ts';

	import {
		createTypstRenderKey,
		renderTypstSvgResult,
		type TypstRenderResult
	} from './renderer.ts';

	interface Props {
		source?: string;
		mode?: TypstMode;
		inputMode?: TypstInputMode;
		preamble?: string;
		textSize?: string;
		pageMargin?: string;
		cache?: boolean;
		sanitize?: TypstSvgSanitizer;
		ariaLabel?: string;
		title?: string;
		loadingLabel?: string;
		throwOnError?: boolean;
		errorMode?: 'badge' | 'none';
		class?: string;
	}

	const isBrowser = typeof window !== 'undefined';

	let {
		source = '',
		mode = 'inline',
		inputMode = 'math',
		preamble = undefined,
		textSize = undefined,
		pageMargin = undefined,
		cache = undefined,
		sanitize = undefined,
		ariaLabel = undefined,
		title = undefined,
		loadingLabel = 'Rendering Typst…',
		throwOnError = false,
		errorMode = 'badge',
		class: className = ''
	}: Props = $props();

	const renderSource = $derived(inputMode === 'math' ? source.trim() : source);
	const hasRenderableSource = $derived(source.trim().length > 0);
	const tag = $derived(mode === 'inline' ? 'span' : 'div');
	const resolvedOptions = $derived(
		resolveTypstOptions({
			preamble,
			textSize,
			pageMargin,
			cache,
			sanitize
		})
	);
	const request = $derived(
		hasRenderableSource
			? {
					...resolvedOptions,
					source: renderSource,
					mode,
					inputMode
				}
			: null
	);
	const renderKey = $derived(request ? createTypstRenderKey(request) : '');

	interface InitialServerRenderState {
		result: TypstRenderResult | null;
		key: string | null;
	}

	const initialServerState = await renderInitialServerState();
	const initialServerResult = initialServerState.result;

	let hostElement = $state<HTMLElement | null>(null);

	// On the client we intentionally start with `undefined` so Svelte keeps the
	// server-rendered {@html} block during hydration instead of trying to rewrite it.
	let visibleSvg = $state<string | undefined>(isBrowser ? undefined : initialServerResult?.svg);
	let lastGoodSvg = $state(initialServerResult?.svg ?? '');
	let renderedKey = $state<string | null>(isBrowser ? null : initialServerState.key);
	let retainedServerSvg = $state(false);
	let error = $state(initialServerResult?.error ?? '');
	let canShowFallback = $state(!isBrowser);
	let renderGeneration = 0;

	const hasVisibleSvg = $derived(Boolean(visibleSvg || retainedServerSvg || lastGoodSvg));
	const isInvalid = $derived(Boolean(error));
	const shouldShowErrorBadge = $derived(errorMode === 'badge' && Boolean(error));
	const shouldShowEmptyFallback = $derived(
		canShowFallback && !visibleSvg && !retainedServerSvg && !lastGoodSvg && !error
	);
	const shouldShowStandaloneError = $derived(
		canShowFallback && shouldShowErrorBadge && !visibleSvg && !retainedServerSvg && !lastGoodSvg
	);

	$effect(() => {
		if (!isBrowser) return;

		canShowFallback = true;

		if (!request) {
			releaseRetainedServerSvg();
			visibleSvg = '';
			lastGoodSvg = '';
			renderedKey = null;
			error = '';
			return;
		}

		const key = renderKey;

		if (renderedKey === null) {
			const hydratedSvg = readRetainedServerSvg(hostElement, key);

			if (hydratedSvg) {
				lastGoodSvg = hydratedSvg;
				retainedServerSvg = true;
				renderedKey = key;
				error = '';
				return;
			}
		}

		if (renderedKey === key) {
			return;
		}

		const generation = ++renderGeneration;
		renderedKey = key;

		void renderTypstSvgResult(request, throwOnError)
			.then((nextResult: { svg: string | undefined; error: string }) => {
				applyRenderResult(nextResult, generation);
			})
			.catch((err: unknown) => {
				if (generation !== renderGeneration) return;

				applyRenderResult(
					{
						svg: '',
						error: formatErrorMessage(err)
					},
					generation
				);

				if (throwOnError) {
					queueMicrotask(() => {
						throw err;
					});
				}
			});
	});

	function applyRenderResult(
		nextResult: { svg: string | undefined; error: string },
		generation: number
	): void {
		if (generation !== renderGeneration) return;

		if (nextResult.svg) {
			releaseRetainedServerSvg();
			visibleSvg = nextResult.svg;
			lastGoodSvg = nextResult.svg;
			error = '';
			return;
		}

		error = nextResult.error || 'Typst render failed';

		if (retainedServerSvg && lastGoodSvg) {
			// Keep the retained SSR SVG in place while showing the error badge.
			// Setting {@html} here would insert a duplicate because Svelte does not
			// own the retained server DOM after hydration.
			visibleSvg = undefined;
		} else if (lastGoodSvg) {
			visibleSvg = lastGoodSvg;
			retainedServerSvg = false;
		} else {
			visibleSvg = '';
			retainedServerSvg = false;
		}
	}

	function formatErrorMessage(err: unknown): string {
		return err instanceof Error ? err.message : String(err);
	}

	async function renderInitialServerState(): Promise<InitialServerRenderState> {
		if (isBrowser) {
			return { result: null, key: null };
		}

		const currentRequest = request;

		if (!currentRequest) {
			return { result: null, key: null };
		}

		const result = await renderTypstSvgResult(currentRequest, throwOnError);

		return {
			result,
			key: result.svg ? createTypstRenderKey(currentRequest) : null
		};
	}

	function releaseRetainedServerSvg(): void {
		if (!retainedServerSvg) return;

		const element = hostElement;

		if (element) {
			for (const child of Array.from(element.childNodes)) {
				if (child.nodeType === 1 && (child as Element).tagName.toLowerCase() === 'svg') {
					child.remove();
				}
			}
		}

		retainedServerSvg = false;
	}

	function readRetainedServerSvg(element: HTMLElement | null, key: string): string {
		if (!element || element.dataset.typleteKey !== key) {
			return '';
		}

		return element.querySelector('svg')?.outerHTML ?? '';
	}

	function formatErrorLabel(message: string): string {
		const firstLine =
			message
				.split('\n')
				.find((line) => line.trim())
				?.trim() ?? 'Typst error';
		return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
	}
</script>

<svelte:element
	this={tag}
	bind:this={hostElement}
	class={`typst typst-${mode} ${isInvalid ? 'typst-invalid' : ''} ${className}`}
	role={ariaLabel ? 'img' : undefined}
	aria-label={ariaLabel}
	{title}
	data-typlete-key={renderKey || undefined}
	data-error={error || undefined}
	data-has-visible-svg={hasVisibleSvg ? 'true' : undefined}
>
	{@html visibleSvg}

	{#if shouldShowEmptyFallback}
		<span class="typst-placeholder" aria-label={loadingLabel}></span>
	{/if}

	{#if shouldShowStandaloneError}
		<span class="typst-error-badge" title={error} aria-label={error}>
			{formatErrorLabel(error)}
		</span>
	{:else if shouldShowErrorBadge}
		<span class="typst-error-badge typst-error-badge-overlay" title={error} aria-label={error}>
			Typst error
		</span>
	{/if}
</svelte:element>

<style>
	.typst {
		--typst-inline-height: 1.15em;
		--typst-inline-baseline: -0.18em;
		--typst-block-margin: 0.85rem auto;
		--typst-error-color: #b42318;
		--typst-error-bg: #fff1f0;
		--typst-error-border: #ffccc7;
		position: relative;
	}

	.typst-inline {
		display: inline-block;
		line-height: 0;
		vertical-align: var(--typst-inline-baseline);
	}

	.typst-inline :global(svg) {
		display: inline-block;
		height: var(--typst-inline-height);
		width: auto;
		overflow: visible;
	}

	.typst-block {
		display: block;
		text-align: center;
		margin: var(--typst-block-margin);
	}

	.typst-block :global(svg) {
		display: block;
		max-width: 100%;
		height: auto;
		margin-inline: auto;
	}

	.typst-invalid[data-has-visible-svg='true'] {
		outline: 1px solid var(--typst-error-border);
		outline-offset: 3px;
		border-radius: 4px;
	}

	.typst-error-badge {
		display: inline-flex;
		align-items: center;
		max-width: min(42rem, 100%);
		border: 1px solid var(--typst-error-border);
		border-radius: 999px;
		padding: 0.16rem 0.46rem;
		background: var(--typst-error-bg);
		color: var(--typst-error-color);
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1.25;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.typst-error-badge-overlay {
		position: absolute;
		z-index: 1;
		top: -0.65rem;
		right: -0.45rem;
		box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
	}

	.typst-inline .typst-error-badge-overlay {
		top: -1.05rem;
		right: -0.25rem;
	}

	.typst-placeholder {
		display: inline-block;
		min-width: 1em;
		min-height: 1em;
	}
</style>
