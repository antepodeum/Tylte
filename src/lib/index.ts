export { default as Typst } from './Typst.svelte';
export { default as TypstInline } from './TypstInline.svelte';
export { default as TypstBlock } from './TypstBlock.svelte';

export { DEFAULT_TYPST_OPTIONS, normalizeTypstInputMode, resolveTypstOptions } from './config.ts';

export {
	clearTypstSvgCache,
	createTypstDocument,
	createTypstRenderKey,
	renderTypstSvg,
	renderTypstSvgResult
} from './renderer.ts';

export { hashCacheKey } from './hash.ts';
export { stripSvgScripts } from './svg.ts';

export type {
	TypstInputMode,
	TypstMode,
	TypstRendererOptions,
	TypstResolvedRendererOptions,
	TypstSvgSanitizer
} from './config.ts';

export type { TypstRenderRequest, TypstRenderResult } from './renderer.ts';
