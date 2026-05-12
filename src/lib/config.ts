export type TypstMode = 'inline' | 'block';
export type TypstInputMode = 'math' | 'raw' | 'markup';

export type TypstSvgSanitizer = (svg: string) => string;

export interface TypstRendererOptions {
	preamble?: string;
	textSize?: string;
	pageMargin?: string;
	cache?: boolean;
	sanitize?: TypstSvgSanitizer;
}

export interface TypstResolvedRendererOptions {
	preamble: string;
	textSize: string;
	pageMargin: string;
	cache: boolean;
	sanitize?: TypstSvgSanitizer;
}

export const DEFAULT_TYPST_OPTIONS: TypstResolvedRendererOptions = {
	preamble: '',
	textSize: '11pt',
	pageMargin: '0pt',
	cache: true
};

export function resolveTypstOptions(
	options: TypstRendererOptions = {}
): TypstResolvedRendererOptions {
	return {
		preamble: options.preamble ?? DEFAULT_TYPST_OPTIONS.preamble,
		textSize: options.textSize ?? DEFAULT_TYPST_OPTIONS.textSize,
		pageMargin: options.pageMargin ?? DEFAULT_TYPST_OPTIONS.pageMargin,
		cache: options.cache ?? DEFAULT_TYPST_OPTIONS.cache,
		sanitize: options.sanitize
	};
}

export function normalizeTypstInputMode(inputMode: TypstInputMode): 'math' | 'raw' {
	return inputMode === 'math' ? 'math' : 'raw';
}
