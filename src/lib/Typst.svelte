<script lang="ts">
  import { onMount } from 'svelte';
  import {
    resolveTypstOptions,
    type TypstInputMode,
    type TypstMode,
    type TypstSvgSanitizer
  } from './config';
  import { renderTypstSvg } from './renderer';

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

  let svg = $state('');
  let error = $state('');
  let pending = $state(false);
  let mounted = $state(false);
  let renderSeq = 0;

  let tag = $derived(mode === 'inline' ? 'span' : 'div');
  let resolvedOptions = $derived(
    resolveTypstOptions({
      preamble,
      textSize,
      pageMargin,
      cache,
      sanitize
    })
  );

  onMount(() => {
    mounted = true;

    return () => {
      renderSeq += 1;
    };
  });

  $effect(() => {
    if (!mounted) return;

    source;
    mode;
    inputMode;
    resolvedOptions;

    void render();
  });

  async function render() {
    const currentSeq = ++renderSeq;
    const trimmedSource = source.trim();

    if (!trimmedSource) {
      svg = '';
      error = '';
      pending = false;
      return;
    }

    pending = true;
    error = '';

    try {
      const nextSvg = await renderTypstSvg({
        ...resolvedOptions,
        source: trimmedSource,
        mode,
        inputMode
      });

      if (currentSeq === renderSeq) {
        svg = nextSvg;
        error = '';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (currentSeq === renderSeq) {
        svg = '';
        error = message;
      }

      if (throwOnError) {
        throw err;
      }
    } finally {
      if (currentSeq === renderSeq) {
        pending = false;
      }
    }
  }
</script>

<svelte:element
  this={tag}
  class={`typst typst-${mode} ${className}`}
  role={ariaLabel ? 'img' : undefined}
  aria-label={ariaLabel}
  aria-busy={pending ? 'true' : undefined}
  title={title}
  data-pending={pending ? 'true' : undefined}
  data-error={error || undefined}
>
  {#if svg}
    {@html svg}
  {:else if error}
    <span class="typst-error">{error}</span>
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
