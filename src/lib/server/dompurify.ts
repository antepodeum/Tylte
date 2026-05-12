import type { TypstSvgSanitizer } from '../config.ts';

export async function createServerDomPurifySvgSanitizer(): Promise<TypstSvgSanitizer> {
	const [{ JSDOM }, createDOMPurifyModule] = await Promise.all([
		import('jsdom'),
		import('dompurify')
	]);

	const window = new JSDOM('').window;
	const createDOMPurify = createDOMPurifyModule.default as unknown as (window: unknown) => {
		sanitize(input: string, options?: Record<string, unknown>): string;
	};
	const DOMPurify = createDOMPurify(window);

	return (svg: string) =>
		DOMPurify.sanitize(svg, {
			USE_PROFILES: { svg: true, svgFilters: true }
		});
}
