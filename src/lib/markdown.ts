import {
	resolveTypstOptions,
	type TypstInputMode,
	type TypstMode,
	type TypstRendererOptions
} from './config.ts';
import { renderTypstSvg } from './renderer.ts';

export interface TypstMarkdownOptions extends TypstRendererOptions {
	inlineMode?: TypstMode;
	blockMode?: TypstMode;
}

const TYPST_RAW_FENCE_RE = /```typst\s*\n([\s\S]*?)\n```/g;
const TYPST_MATH_FENCE_RE = /```typst-math\s*\n([\s\S]*?)\n```/g;
const TYPST_INLINE_RE = /\{\{typst\s+([\s\S]*?)\}\}/g;

export async function preRenderTypstMarkdown(
	markdown: string,
	options: TypstMarkdownOptions = {}
): Promise<string> {
	const resolvedOptions = resolveTypstOptions(options);

	let output = await replaceAsync(markdown, TYPST_RAW_FENCE_RE, async (match, source) => {
		return renderMarkdownTypst(source, 'block', 'raw', resolvedOptions, match);
	});

	output = await replaceAsync(output, TYPST_MATH_FENCE_RE, async (match, source) => {
		return renderMarkdownTypst(
			source,
			options.blockMode ?? 'block',
			'math',
			resolvedOptions,
			match
		);
	});

	output = await replaceAsync(output, TYPST_INLINE_RE, async (match, source) => {
		return renderMarkdownTypst(
			source,
			options.inlineMode ?? 'inline',
			'math',
			resolvedOptions,
			match
		);
	});

	return output;
}

export function createTypstMdsvexPreprocessor(options: TypstMarkdownOptions = {}) {
	return {
		name: 'tylte-typst-mdsvex',
		markup: async ({ content, filename }: { content: string; filename?: string }) => {
			if (filename && !/\.(md|svx|svelte\.md)$/i.test(filename)) {
				return undefined;
			}

			return {
				code: await preRenderTypstMarkdown(content, options)
			};
		}
	};
}

async function renderMarkdownTypst(
	source: string,
	mode: TypstMode,
	inputMode: TypstInputMode,
	options: ReturnType<typeof resolveTypstOptions>,
	fallback: string
): Promise<string> {
	try {
		return await renderTypstSvg({
			...options,
			source: source.trim(),
			mode,
			inputMode
		});
	} catch {
		return fallback;
	}
}

async function replaceAsync(
	input: string,
	pattern: RegExp,
	replacer: (match: string, ...groups: string[]) => Promise<string>
): Promise<string> {
	const matches = Array.from(input.matchAll(pattern));

	if (matches.length === 0) {
		return input;
	}

	const replacements = await Promise.all(
		matches.map((match) => replacer(match[0], ...match.slice(1)))
	);

	let output = '';
	let lastIndex = 0;

	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		output += input.slice(lastIndex, match.index);
		output += replacements[index];
		lastIndex = (match.index ?? 0) + match[0].length;
	}

	output += input.slice(lastIndex);
	return output;
}
