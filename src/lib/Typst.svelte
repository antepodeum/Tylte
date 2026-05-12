<script lang="ts">
  import {
    resolveTypstOptions,
    type TypstInputMode,
    type TypstMode,
    type TypstSvgSanitizer
  } from './config';
  import { renderTypstSvgResult } from './renderer';

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

  const result = $derived(
    trimmedSource
      ? await renderTypstSvgResult(
          {
            ...resolvedOptions,
            source: trimmedSource,
            mode,
            inputMode
          },
          throwOnError
        )
      : { svg: '', error: '', ssrFailed: false }
  );
</script>

<svelte:element
  this={tag}
  class={`typst typst-${mode} ${className}`}
  role={ariaLabel ? 'img' : undefined}
  aria-label={ariaLabel}
  title={title}
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
