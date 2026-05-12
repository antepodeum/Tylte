import type { TypstInputMode, TypstMode, TypstResolvedRendererOptions } from './config';
import { createTypstDocument } from './document';
import { hashCacheKey } from './hash';

export interface TypstRenderRequest extends TypstResolvedRendererOptions {
  source: string;
  mode: TypstMode;
  inputMode: TypstInputMode;
}

export interface TypstRenderResult {
  svg: string;
  error: string;
  ssrFailed: boolean;
}

interface TypstApi {
  svg(input: { mainContent: string }): Promise<string>;
  setCompilerInitOptions?: (options: { getModule: () => string }) => void;
  setRendererInitOptions?: (options: { getModule: () => string }) => void;
}

let typstPromise: Promise<TypstApi> | null = null;
let browserWasmConfigured = false;

const svgCache = new Map<string, Promise<string>>();
const MAX_CACHE_SIZE = 300;

export { createTypstDocument } from './document';

export async function renderTypstSvg(options: TypstRenderRequest): Promise<string> {
  const mainContent = createTypstDocument(options);
  const cacheKey = hashCacheKey(mainContent);

  const compile = async () => {
    const typst = await getTypst();
    return typst.svg({ mainContent });
  };

  const rawSvgPromise = options.cache ? svgCache.get(cacheKey) ?? compile() : compile();

  if (options.cache && !svgCache.has(cacheKey)) {
    remember(cacheKey, rawSvgPromise);
  }

  const rawSvg = await rawSvgPromise;
  return options.sanitize ? options.sanitize(rawSvg) : rawSvg;
}

export async function renderTypstSvgResult(
  options: TypstRenderRequest,
  throwOnError = false
): Promise<TypstRenderResult> {
  try {
    return {
      svg: await renderTypstSvg(options),
      error: '',
      ssrFailed: false
    };
  } catch (err) {
    if (throwOnError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    const ssrFailed = typeof window === 'undefined';

    return {
      svg: '',
      error: ssrFailed ? '' : message,
      ssrFailed
    };
  }
}

export function clearTypstSvgCache(): void {
  svgCache.clear();
}

function remember(key: string, value: Promise<string>): void {
  if (svgCache.size >= MAX_CACHE_SIZE) {
    const firstKey = svgCache.keys().next().value;
    if (firstKey) svgCache.delete(firstKey);
  }

  svgCache.set(key, value);
}

async function getTypst(): Promise<TypstApi> {
  if (!typstPromise) {
    typstPromise = import('@myriaddreamin/typst.ts').then(({ $typst }) => $typst as TypstApi);
  }

  const typst = await typstPromise;

  if (typeof window !== 'undefined' && !browserWasmConfigured) {
    const { TYPST_COMPILER_ASSET, TYPST_RENDERER_ASSET } = await import('./wasm');

    typst.setCompilerInitOptions?.({
      getModule: () => TYPST_COMPILER_ASSET
    });

    typst.setRendererInitOptions?.({
      getModule: () => TYPST_RENDERER_ASSET
    });

    browserWasmConfigured = true;
  }

  return typst;
}
