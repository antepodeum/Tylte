import type { TypstInputMode, TypstMode, TypstResolvedRendererOptions } from './config';
import { TYPST_COMPILER_ASSET, TYPST_RENDERER_ASSET } from './wasm';

export interface TypstRenderRequest extends TypstResolvedRendererOptions {
  source: string;
  mode: TypstMode;
  inputMode: TypstInputMode;
}

interface TypstApi {
  svg(input: { mainContent: string }): Promise<string>;
  setCompilerInitOptions?: (options: { getModule: () => string }) => void;
  setRendererInitOptions?: (options: { getModule: () => string }) => void;
}

let typstPromise: Promise<TypstApi> | null = null;

const svgCache = new Map<string, Promise<string>>();
const MAX_CACHE_SIZE = 300;

export function createTypstDocument(options: TypstRenderRequest): string {
  const setup = [
    `#set page(width: auto, height: auto, margin: ${options.pageMargin}, fill: none)`,
    `#set text(size: ${options.textSize})`
  ];

  if (options.mode === 'inline') {
    setup.push('#show math.equation: set text(top-edge: "bounds", bottom-edge: "bounds")');
  }

  const body = options.inputMode === 'markup'
    ? options.source
    : createMathBody(options.source, options.mode);

  return [setup.join('\n'), options.preamble, body]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

export async function renderTypstSvg(options: TypstRenderRequest): Promise<string> {
  const mainContent = createTypstDocument(options);
  const cacheKey = JSON.stringify({ mainContent });

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

export function clearTypstSvgCache(): void {
  svgCache.clear();
}

function createMathBody(source: string, mode: TypstMode): string {
  if (mode === 'inline') {
    return `#box[$${source}$]`;
  }

  return `#align(center)[$ ${source} $]`;
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
    typstPromise = import('@myriaddreamin/typst.ts').then(({ $typst }) => {
      const typst = $typst as TypstApi;

      typst.setCompilerInitOptions?.({
        getModule: () => TYPST_COMPILER_ASSET
      });

      typst.setRendererInitOptions?.({
        getModule: () => TYPST_RENDERER_ASSET
      });

      return typst;
    });
  }

  return typstPromise;
}
