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

export interface CreateTypstMdsvexPreprocessorOptions extends TransformTylteMarkdownOptions {
	/**
	 * Injects an instance-level Svelte import for the generated component tags.
	 * Set this to false when components are already imported by another MDsveX hook.
	 */
	injectComponentImports?: boolean;
	componentImportSource?: string;
}

export interface TylteMarkdownToken {
	source: string;
	mode: 'inline' | 'block';
	inputMode: 'math' | 'raw';
}

export interface TylteMdsvexPreprocessor {
	name: string;
	markup(input: { content: string; filename?: string }): Promise<{ code: string }>;
}

interface ProtectedRange {
	start: number;
	end: number;
}

const SHORTCODE_RE = /\\?\{\{(~?)([\s\S]*?)(~?)\}\}/g;
const MARKDOWN_EXTENSION_RE = /\.(md|svx|mdx)$/i;

export async function transformTylteMarkdown(
	markdown: string,
	options: TransformTylteMarkdownOptions = {}
): Promise<string> {
	const output = options.output ?? 'component';
	const chunks = splitByProtectedMarkdown(markdown);
	const rendered: string[] = [];

	for (const chunk of chunks) {
		if (chunk.kind === 'protected') {
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

export function createTypstMdsvexPreprocessor(
	options: CreateTypstMdsvexPreprocessorOptions = {}
): TylteMdsvexPreprocessor {
	return {
		name: 'tylte-mdsvex',
		async markup({ content, filename }) {
			if (filename && !MARKDOWN_EXTENSION_RE.test(filename)) {
				return { code: content };
			}

			const output = options.output ?? 'component';
			let code = await transformTylteMarkdown(content, {
				...options,
				output
			});

			if (output === 'component' && options.injectComponentImports !== false) {
				code = injectComponentImports(code, options);
			}

			return { code };
		}
	};
}

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

		const token = parseShortcode({
			full,
			openRaw: match[1] ?? '',
			body: match[2] ?? '',
			closeRaw: match[3] ?? '',
			chunk,
			start: index,
			end: index + full.length
		});

		if (!token) {
			result += full;
			continue;
		}

		result += await renderMarkdownToken(token, options);
	}

	result += chunk.slice(lastIndex);
	return result;
}

function parseShortcode(input: {
	full: string;
	openRaw: string;
	body: string;
	closeRaw: string;
	chunk: string;
	start: number;
	end: number;
}): TylteMarkdownToken | null {
	const { openRaw, body, closeRaw, chunk, start, end } = input;
	const hasRawMarker = openRaw === '~' || closeRaw === '~';

	if (hasRawMarker && !(openRaw === '~' && closeRaw === '~')) {
		return null;
	}

	const source = body.trim();

	if (!source) {
		return null;
	}

	const inputMode = hasRawMarker ? 'raw' : 'math';
	const hasOuterWhitespace = body.length > 0 && /^\s/.test(body) && /\s$/.test(body);
	const hasNewline = body.includes('\n') || body.includes('\r');
	const wantsBlock = hasOuterWhitespace || hasNewline;
	const mode = wantsBlock && isStandaloneMarkdownLine(chunk, start, end) ? 'block' : 'inline';

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

		const assetBaseUrl = normalizeAssetBaseUrl(options.assetBaseUrl ?? '');
		const hash = hashToken(token);
		const filename = `tylte-${hash}.svg`;
		const filepath = join(options.assetDir, filename);

		await mkdir(options.assetDir, { recursive: true });
		await writeFile(filepath, svg, 'utf8');

		return `![${escapeMarkdownAlt(token.source)}](${assetBaseUrl}${filename})`;
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

function splitByProtectedMarkdown(markdown: string): Array<{ kind: 'text' | 'protected'; value: string }> {
	const ranges = collectProtectedRanges(markdown);

	if (ranges.length === 0) {
		return [{ kind: 'text', value: markdown }];
	}

	const chunks: Array<{ kind: 'text' | 'protected'; value: string }> = [];
	let lastIndex = 0;

	for (const range of ranges) {
		if (range.start > lastIndex) {
			chunks.push({ kind: 'text', value: markdown.slice(lastIndex, range.start) });
		}

		chunks.push({ kind: 'protected', value: markdown.slice(range.start, range.end) });
		lastIndex = range.end;
	}

	if (lastIndex < markdown.length) {
		chunks.push({ kind: 'text', value: markdown.slice(lastIndex) });
	}

	return chunks;
}

function collectProtectedRanges(markdown: string): ProtectedRange[] {
	return mergeRanges([
		...collectFencedCodeRanges(markdown),
		...collectIndentedCodeRanges(markdown),
		...collectHtmlCommentRanges(markdown),
		...collectSvelteTagRanges(markdown),
		...collectInlineCodeRanges(markdown)
	]);
}

function collectFencedCodeRanges(markdown: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	let index = 0;

	while (index < markdown.length) {
		const line = readLine(markdown, index);
		const opening = line.text.match(/^[ \t]{0,3}(`{3,}|~{3,})[^\r\n]*$/);

		if (!opening) {
			index = line.end;
			continue;
		}

		const start = index;
		const fence = opening[1];
		const fenceChar = fence[0];
		const minFenceLength = fence.length;
		index = line.end;

		while (index < markdown.length) {
			const closingLine = readLine(markdown, index);
			const closing = closingLine.text.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);

			index = closingLine.end;

			if (
				closing &&
				closing[1][0] === fenceChar &&
				closing[1].length >= minFenceLength
			) {
				break;
			}
		}

		ranges.push({ start, end: index });
	}

	return ranges;
}

function collectIndentedCodeRanges(markdown: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	let index = 0;
	let current: ProtectedRange | null = null;

	while (index < markdown.length) {
		const line = readLine(markdown, index);
		const isIndentedCode = /^(?: {4}|\t)/.test(line.text);

		if (isIndentedCode) {
			current ??= { start: index, end: line.end };
			current.end = line.end;
		} else if (current) {
			ranges.push(current);
			current = null;
		}

		index = line.end;
	}

	if (current) {
		ranges.push(current);
	}

	return ranges;
}

function collectHtmlCommentRanges(markdown: string): ProtectedRange[] {
	return collectRegexRanges(markdown, /<!--[\s\S]*?-->/g);
}

function collectSvelteTagRanges(markdown: string): ProtectedRange[] {
	return [
		...collectRegexRanges(markdown, /<script\b[\s\S]*?<\/script>/gi),
		...collectRegexRanges(markdown, /<style\b[\s\S]*?<\/style>/gi)
	];
}

function collectInlineCodeRanges(markdown: string): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];
	let index = 0;

	while (index < markdown.length) {
		const start = markdown.indexOf('`', index);

		if (start === -1) break;

		const opening = countRepeated(markdown, start, '`');
		const closing = findClosingBackticks(markdown, start + opening, opening);

		if (closing === -1) {
			index = start + opening;
			continue;
		}

		ranges.push({ start, end: closing + opening });
		index = closing + opening;
	}

	return ranges;
}

function collectRegexRanges(markdown: string, re: RegExp): ProtectedRange[] {
	const ranges: ProtectedRange[] = [];

	for (const match of markdown.matchAll(re)) {
		const start = match.index ?? 0;
		ranges.push({ start, end: start + match[0].length });
	}

	return ranges;
}

function mergeRanges(ranges: ProtectedRange[]): ProtectedRange[] {
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.sort((a, b) => a.start - b.start || b.end - a.end);
	const merged: ProtectedRange[] = [];

	for (const range of sorted) {
		const previous = merged.at(-1);

		if (!previous || range.start > previous.end) {
			merged.push({ ...range });
		} else {
			previous.end = Math.max(previous.end, range.end);
		}
	}

	return merged;
}

function readLine(input: string, start: number): { text: string; end: number } {
	const newline = input.indexOf('\n', start);
	const end = newline === -1 ? input.length : newline + 1;
	const text = input.slice(start, newline === -1 ? end : newline).replace(/\r$/, '');

	return { text, end };
}

function countRepeated(input: string, start: number, char: string): number {
	let count = 0;

	while (input[start + count] === char) {
		count += 1;
	}

	return count;
}

function findClosingBackticks(input: string, start: number, length: number): number {
	let index = start;

	while (index < input.length) {
		const next = input.indexOf('`', index);

		if (next === -1) return -1;

		const count = countRepeated(input, next, '`');

		if (count === length) {
			return next;
		}

		index = next + count;
	}

	return -1;
}

function isStandaloneMarkdownLine(chunk: string, start: number, end: number): boolean {
	const lineStart = chunk.lastIndexOf('\n', start - 1) + 1;
	const lineEndIndex = chunk.indexOf('\n', end);
	const lineEnd = lineEndIndex === -1 ? chunk.length : lineEndIndex;
	const before = chunk.slice(lineStart, start);
	const after = chunk.slice(end, lineEnd);

	return before.trim().length === 0 && after.trim().length === 0;
}

function injectComponentImports(
	content: string,
	options: Pick<
		CreateTypstMdsvexPreprocessorOptions,
		'componentBlockName' | 'componentInlineName' | 'componentImportSource'
	>
): string {
	const inlineName = options.componentInlineName ?? 'TypstInline';
	const blockName = options.componentBlockName ?? 'TypstBlock';
	const importSource = options.componentImportSource ?? 'tylte';

	if (!content.includes(`<${inlineName}`) && !content.includes(`<${blockName}`)) {
		return content;
	}

	if (hasTylteComponentImports(content, inlineName, blockName, importSource)) {
		return content;
	}

	const specifiers = [
		inlineName === 'TypstInline' ? 'TypstInline' : `TypstInline as ${inlineName}`,
		blockName === 'TypstBlock' ? 'TypstBlock' : `TypstBlock as ${blockName}`
	];
	const importLine = `import { ${specifiers.join(', ')} } from ${JSON.stringify(importSource)};`;
	const instanceScript = findInstanceScript(content);

	if (instanceScript) {
		return `${content.slice(0, instanceScript.insertAt)}\n\t${importLine}${content.slice(instanceScript.insertAt)}`;
	}

	return `<script lang="ts">\n\t${importLine}\n</script>\n\n${content}`;
}

function hasTylteComponentImports(
	content: string,
	inlineName: string,
	blockName: string,
	importSource: string
): boolean {
	const importSourcePattern = escapeRegExp(importSource);
	const importRe = new RegExp(
		`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${importSourcePattern}['"]`,
		'g'
	);

	for (const match of content.matchAll(importRe)) {
		const specifiers = match[1] ?? '';

		if (
			importsName(specifiers, inlineName, 'TypstInline') &&
			importsName(specifiers, blockName, 'TypstBlock')
		) {
			return true;
		}
	}

	return false;
}

function importsName(specifiers: string, localName: string, exportedName: string): boolean {
	return specifiers
		.split(',')
		.map((specifier) => specifier.trim())
		.some((specifier) => {
			if (specifier === localName || specifier === exportedName) return true;

			const aliasMatch = specifier.match(/^(\w+)\s+as\s+(\w+)$/);
			return Boolean(aliasMatch && aliasMatch[1] === exportedName && aliasMatch[2] === localName);
		});
}

function findInstanceScript(content: string): { insertAt: number } | null {
	const scriptRe = /<script\b([^>]*)>/gi;

	for (const match of content.matchAll(scriptRe)) {
		const attributes = match[1] ?? '';
		const isModuleScript = /\b(?:context\s*=\s*['"]module['"]|module\b)/i.test(attributes);

		if (!isModuleScript) {
			return { insertAt: (match.index ?? 0) + match[0].length };
		}
	}

	return null;
}

function normalizeAssetBaseUrl(assetBaseUrl: string): string {
	if (!assetBaseUrl) return '';
	return assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
