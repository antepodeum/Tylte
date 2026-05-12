import {
  normalizeTypstInputMode,
  type TypstInputMode,
  type TypstMode,
  type TypstResolvedRendererOptions
} from './config';

export interface TypstDocumentRequest extends TypstResolvedRendererOptions {
  source: string;
  mode: TypstMode;
  inputMode: TypstInputMode;
}

export function createTypstDocument(options: TypstDocumentRequest): string {
  const setup = [
    `#set page(width: auto, height: auto, margin: ${options.pageMargin}, fill: none)`,
    `#set text(size: ${options.textSize})`
  ];

  if (options.mode === 'inline') {
    setup.push('#show math.equation: set text(top-edge: "bounds", bottom-edge: "bounds")');
  }

  const body = normalizeTypstInputMode(options.inputMode) === 'raw'
    ? options.source
    : createMathBody(options.source, options.mode);

  return [setup.join('\n'), options.preamble, body]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

function createMathBody(source: string, mode: TypstMode): string {
  if (mode === 'inline') {
    return `#box[$${source}$]`;
  }

  return `#align(center)[$ ${source} $]`;
}
