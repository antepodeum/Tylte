<script lang="ts">
  import Typst from './Typst.svelte';
  import type { TypstInputMode, TypstSvgSanitizer } from './config';

  interface Props {
    source?: string;
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
</script>

<Typst
  mode="block"
  {source}
  {inputMode}
  {preamble}
  {textSize}
  {pageMargin}
  {cache}
  {sanitize}
  {ariaLabel}
  {title}
  {loadingLabel}
  {throwOnError}
  class={className}
/>
