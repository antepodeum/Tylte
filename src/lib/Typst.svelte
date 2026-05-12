<script lang="ts">
  import {
    resolveTypstOptions,
    type TypstInputMode,
    type TypstMode,
    type TypstSvgSanitizer
  } from './config';
  import { createTypstRenderKey, renderTypstSvgResult, type TypstRenderResult } from './renderer';

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
    class: className = ''
  }: Props = $props();

  const initialRequest = createRequest(
    source,
    mode,
    inputMode,
    preamble,
    textSize,
    pageMargin,
    cache,
    sanitize
  );
  const initialKey = initialRequest ? createTypstRenderKey(initialRequest) : '';
  const hydratedResult = isBrowser && initialKey ? readHydratedResult(initialKey) : null;

  let clientResult = $state<TypstRenderResult | null>(hydratedResult);
  let clientKey = $state<string | null>(hydratedResult ? initialKey : null);
  let renderGeneration = 0;

  const trimmedSource = $derived(source.trim());
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
    trimmedSource
      ? {
          ...resolvedOptions,
          source: trimmedSource,
          mode,
          inputMode
        }
      : null
  );
  const renderKey = $derived(request ? createTypstRenderKey(request) : '');
  const emptyResult = $derived({ svg: '', error: '', ssrFailed: false });

  const serverResult = $derived(
    !isBrowser && request
      ? await renderTypstSvgResult(request, throwOnError)
      : null
  );

  const result = $derived(
    isBrowser ? (clientResult ?? emptyResult) : (serverResult ?? emptyResult)
  );

  $effect(() => {
    if (!isBrowser || !request) {
      return;
    }

    const key = renderKey;

    // During hydration, keep the SSR SVG that is already in the DOM.
    // This prevents loading typst.ts + the large WASM chunks until the first real change.
    if (clientKey === key && clientResult) {
      return;
    }

    const generation = ++renderGeneration;
    clientKey = key;

    void renderTypstSvgResult(request, throwOnError).then((nextResult) => {
      if (generation === renderGeneration) {
        clientResult = nextResult;
      }
    });
  });

  function createRequest(
    rawSource: string,
    rawMode: TypstMode,
    rawInputMode: TypstInputMode,
    rawPreamble: string | undefined,
    rawTextSize: string | undefined,
    rawPageMargin: string | undefined,
    rawCache: boolean | undefined,
    rawSanitize: TypstSvgSanitizer | undefined
  ) {
    const normalizedSource = rawSource.trim();

    if (!normalizedSource) {
      return null;
    }

    return {
      ...resolveTypstOptions({
        preamble: rawPreamble,
        textSize: rawTextSize,
        pageMargin: rawPageMargin,
        cache: rawCache,
        sanitize: rawSanitize
      }),
      source: normalizedSource,
      mode: rawMode,
      inputMode: rawInputMode
    };
  }

  function readHydratedResult(key: string): TypstRenderResult | null {
    const element = document.querySelector<HTMLElement>(`[data-tylte-key="${key}"]`);
    const svg = element?.querySelector('svg')?.outerHTML ?? '';

    if (!svg) {
      return null;
    }

    return {
      svg,
      error: '',
      ssrFailed: false
    };
  }
</script>

<svelte:element
  this={tag}
  class={`typst typst-${mode} ${className}`}
  role={ariaLabel ? 'img' : undefined}
  aria-label={ariaLabel}
  title={title}
  data-tylte-key={renderKey || undefined}
  data-error={result.error || undefined}
  data-ssr-failed={result.ssrFailed ? 'true' : undefined}
>
  {#if result.svg}
    {@html result.svg}
  {:else if result.error}
    <span class="typst-error">{result.error}</span>
  {:else}
    <span class="typst-placeholder" aria-label={loadingLabel}></span>
  {/if}
</svelte:element>

<style>
  .typst {
    --typst-inline-height: 1.15em;
    --typst-inline-baseline: -0.18em;
    --typst-block-margin: 0.85rem auto;
    --typst-error-opacity: 0.72;
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

  .typst-error {
    color: currentColor;
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      monospace;
    font-size: 0.875em;
    opacity: var(--typst-error-opacity);
    white-space: pre-wrap;
  }

  .typst-placeholder {
    display: inline-block;
    min-width: 1em;
    min-height: 1em;
  }
</style>
