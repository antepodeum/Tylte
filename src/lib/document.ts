import {
	normalizeTypstInputMode,
	type TypstInputMode,
	type TypstMode,
	type TypstResolvedRendererOptions
} from './config.ts';

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

	const normalizedInputMode = normalizeTypstInputMode(options.inputMode);
	const body =
		normalizedInputMode === 'raw' ? options.source : createMathBody(options.source, options.mode);

	return [setup.join('\n'), options.preamble, body]
		.filter((part) => part.trim().length > 0)
		.join('\n\n');
}

function createMathBody(source: string, mode: TypstMode): string {
	const escapedSource = escapeTypstMathSource(source);

	if (mode === 'inline') {
		return `#box[$ ${escapedSource} $]`;
	}

	return `#align(center)[$ ${escapedSource} $]`;
}

export function escapeTypstMathSource(source: string): string {
	let escaped = '';

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];

		if ((char === '$' || char === '#') && !isEscapedByBackslash(source, index)) {
			escaped += `\\${char}`;
			continue;
		}

		escaped += char;
	}

	return escaped;
}

function isEscapedByBackslash(source: string, index: number): boolean {
	let slashCount = 0;
	let cursor = index - 1;

	while (cursor >= 0 && source[cursor] === '\\') {
		slashCount += 1;
		cursor -= 1;
	}

	return slashCount % 2 === 1;
}
