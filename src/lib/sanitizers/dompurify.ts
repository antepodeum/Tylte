import type { TypstSvgSanitizer } from '../config';

export interface DomPurifyLike {
  sanitize(input: string, options?: Record<string, unknown>): string;
}

export async function createDomPurifySvgSanitizer(): Promise<TypstSvgSanitizer> {
  const module = await import('dompurify');
  const DOMPurify = (module.default ?? module) as DomPurifyLike;

  return (svg: string) => DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true }
  });
}
