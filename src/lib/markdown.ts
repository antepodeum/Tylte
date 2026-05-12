import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderTypstSvgServer } from './server.ts';

export type TylteMarkdownOutput = 'component' | 'html' | 'markdown-image' | 'asset';

export interface TransformTylteMarkdownOptions {
	output?: TylteMarkdownOutput;
	assetDir?: string;
	assetBaseUrl?: string;
	componentInlineName?: string;
	componentBlockName?: string;

	preamble?: string;
	textSize?: string;
	pageMargin?: string;
	cache?: boolean;
}

export interface TylteMarkdownToken {
	source: string;
	mode: 'inline' | 'block';
	inputMode: 'math' | 'raw';
}

const SHORTCODE_RE = /\\?\{\{(~?)([\s\S]*?)(~?)\}\}/g;

const FENCED_CODE_RE = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;

export async function transformTylteMarkdown(
	markdown: string,
	options: TransformTylteMarkdownOptions = {}
): Promise<string> {
	const output = options.output ?? 'component';

	const chunks = splitByFencedCode(markdown);
	const rendered: string[] = [];

	for (const chunk of chunks) {
		if (chunk.kind === 'code') {
			rendered.push(chunk.value);
			continue;
		}

		rendered.push(
			await transformChunk(chunk.value, {
				...options,
				output
			})
		);
	}

	return rendered.join('');
}

export const preRenderTypstMarkdown = transformTylteMarkdown;

async function transformChunk(
	chunk: string,
	options: Required<Pick<TransformTylteMarkdownOptions, 'output'>> & TransformTylteMarkdownOptions
): Promise<string> {
	let result = '';
	let lastIndex = 0;

	for (const match of chunk.matchAll(SHORTCODE_RE)) {
		const full = match[0];
		const index = match.index ?? 0;

		result += chunk.slice(lastIndex, index);
		lastIndex = index + full.length;

		if (full.startsWith('\\{{')) {
			result += full.slice(1);
			continue;
		}

		const token = parseShortcode(full, match[1] ?? '', match[2] ?? '', match[3] ?? '');

		if (!token) {
			result += full;
			continue;
		}

		result += await renderMarkdownToken(token, options);
	}

	result += chunk.slice(lastIndex);
	return result;
}

function parseShortcode(
	full: string,
	openRaw: string,
	body: string,
	closeRaw: string
): TylteMarkdownToken | null {
	const hasRawMarker = openRaw === '~' || closeRaw === '~';

	if (hasRawMarker && !(openRaw === '~' && closeRaw === '~')) {
		return null;
	}

	const inputMode = hasRawMarker ? 'raw' : 'math';

	const hasOuterWhitespace = body.length > 0 && /^\s/.test(body) && /\s$/.test(body);

	const hasNewline = body.includes('\n');

	const mode = hasOuterWhitespace || hasNewline ? 'block' : 'inline';
	const source = mode === 'block' ? body.trim() : body;

	if (!source.trim()) {
		return null;
	}

	return {
		source,
		mode,
		inputMode
	};
}

async function renderMarkdownToken(
	token: TylteMarkdownToken,
	options: TransformTylteMarkdownOptions & { output: TylteMarkdownOutput }
): Promise<string> {
	if (options.output === 'component') {
		return renderComponentToken(token, options);
	}

	const svg = await renderTypstSvgServer({
		source: token.source,
		mode: token.mode,
		inputMode: token.inputMode,
		preamble: options.preamble ?? '',
		textSize: options.textSize ?? '11pt',
		pageMargin: options.pageMargin ?? '0pt',
		cache: options.cache ?? true
	});

	if (options.output === 'html') {
		const tag = token.mode === 'inline' ? 'span' : 'div';

		return `<${tag} class="tylte-markdown tylte-markdown-${token.mode}">${svg}</${tag}>`;
	}

	if (options.output === 'markdown-image') {
		const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
		return `![${escapeMarkdownAlt(token.source)}](${uri})`;
	}

	if (options.output === 'asset') {
		if (!options.assetDir) {
			throw new Error('transformTylteMarkdown: assetDir is required when output="asset".');
		}

		const assetBaseUrl = options.assetBaseUrl ?? '';
		const hash = hashToken(token);
		const filename = `tylte-${hash}.svg`;
		const filepath = join(options.assetDir, filename);

		await mkdir(options.assetDir, { recursive: true });
		await writeFile(filepath, svg, 'utf8');

		return `![${escapeMarkdownAlt(token.source)}](${assetBaseUrl}/${filename})`;
	}

	return '';
}

function renderComponentToken(
	token: TylteMarkdownToken,
	options: TransformTylteMarkdownOptions
): string {
	const inlineName = options.componentInlineName ?? 'TypstInline';
	const blockName = options.componentBlockName ?? 'TypstBlock';
	const name = token.mode === 'inline' ? inlineName : blockName;

	const attrs = [
		`source={${JSON.stringify(token.source)}}`,
		token.inputMode === 'raw' ? `inputMode="raw"` : '',
		options.preamble !== undefined ? `preamble={${JSON.stringify(options.preamble)}}` : '',
		options.textSize !== undefined ? `textSize={${JSON.stringify(options.textSize)}}` : '',
		options.pageMargin !== undefined ? `pageMargin={${JSON.stringify(options.pageMargin)}}` : '',
		options.cache !== undefined ? `cache={${JSON.stringify(options.cache)}}` : ''
	].filter(Boolean);

	return `<${name} ${attrs.join(' ')} />`;
}

function splitByFencedCode(markdown: string): Array<{ kind: 'text' | 'code'; value: string }> {
	const chunks: Array<{ kind: 'text' | 'code'; value: string }> = [];

	let lastIndex = 0;

	for (const match of markdown.matchAll(FENCED_CODE_RE)) {
		const index = match.index ?? 0;

		if (index > lastIndex) {
			chunks.push({
				kind: 'text',
				value: markdown.slice(lastIndex, index)
			});
		}

		chunks.push({
			kind: 'code',
			value: match[0]
		});

		lastIndex = index + match[0].length;
	}

	if (lastIndex < markdown.length) {
		chunks.push({
			kind: 'text',
			value: markdown.slice(lastIndex)
		});
	}

	return chunks;
}

function hashToken(token: TylteMarkdownToken): string {
	return createHash('sha256').update(JSON.stringify(token)).digest('hex').slice(0, 16);
}

function escapeMarkdownAlt(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('[', '\\[')
		.replaceAll(']', '\\]')
		.replaceAll('\n', ' ');
}
