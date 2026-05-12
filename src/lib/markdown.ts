import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderTypstSvgServer } from './server.ts';

export type TypleteMarkdownOutput = 'component' | 'html' | 'markdown-image' | 'asset';

export interface TransformTypleteMarkdownOptions {
	output?: TypleteMarkdownOutput;
	assetDir?: string;
	assetBaseUrl?: string;
	componentInlineName?: string;
	componentBlockName?: string;

	preamble?: string;
	textSize?: string;
	pageMargin?: string;
	cache?: boolean;
}

export interface CreateTypstMdsvexPreprocessorOptions extends TransformTypleteMarkdownOptions {
	/**
	 * Injects an instance-level Svelte import for the generated component tags.
	 * Set this to false when components are already imported by another MDsveX hook.
	 */
	injectComponentImports?: boolean;
	componentImportSource?: string;
}

export interface TypleteMarkdownToken {
	source: string;
	mode: 'inline' | 'block';
	inputMode: 'math' | 'raw';
}

export interface TypleteMdsvexPreprocessor {
	name: string;
	markup(input: { content: string; filename?: string }): Promise<{ code: string }>;
}

interface MarkdownFence {
	start: number;
	end: number;
	contentStart: number;
	contentEnd: number;
	info: string;
}

const MARKDOWN_EXTENSION_RE = /\.(md|svx|mdx)$/i;

export async function transformTypleteMarkdown(
	markdown: string,
	options: TransformTypleteMarkdownOptions = {}
): Promise<string> {
	const output = options.output ?? 'component';
	const fences = collectFencedCodeBlocks(markdown);

	if (fences.length === 0) {
		return markdown;
	}

	let result = '';
	let lastIndex = 0;

	for (const fence of fences) {
		const typstFence = parseTypstFenceInfo(fence.info);

		if (!typstFence) {
			continue;
		}

		const source = normalizeFenceContent(markdown.slice(fence.contentStart, fence.contentEnd));

		if (!source.trim()) {
			continue;
		}

		result += markdown.slice(lastIndex, fence.start);
		result += await renderMarkdownToken(
			{
				source: typstFence.inputMode === 'math' ? source.trim() : source,
				mode: 'block',
				inputMode: typstFence.inputMode
			},
			{
				...options,
				output
			}
		);
		result += getConsumedClosingLineEnding(markdown, fence.end);
		lastIndex = fence.end;
	}

	result += markdown.slice(lastIndex);
	return result;
}

export const preRenderTypstMarkdown = transformTypleteMarkdown;

export function createTypstMdsvexPreprocessor(
	options: CreateTypstMdsvexPreprocessorOptions = {}
): TypleteMdsvexPreprocessor {
	return {
		name: 'typlete-mdsvex',
		async markup({ content, filename }) {
			if (filename && !MARKDOWN_EXTENSION_RE.test(filename)) {
				return { code: content };
			}

			const output = options.output ?? 'component';
			let code = await transformTypleteMarkdown(content, {
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

function parseTypstFenceInfo(info: string): { inputMode: 'math' | 'raw' } | null {
	const normalized = info.trim().toLowerCase();

	if (!normalized) return null;

	const [language, ...rest] = normalized.split(/\s+/);
	const mode = rest[0] ?? '';

	if (language === 'typlete') {
		if (mode === 'math') return { inputMode: 'math' };
		if (mode === 'raw' || mode === 'typst' || mode === '') return { inputMode: 'raw' };
		return null;
	}

	if (language === 'typlete-math' || language === 'typlete-typst-math') {
		return { inputMode: 'math' };
	}

	if (language === 'typlete-raw' || language === 'typlete-typst') {
		return { inputMode: 'raw' };
	}

	return null;
}

async function renderMarkdownToken(
	token: TypleteMarkdownToken,
	options: TransformTypleteMarkdownOptions & { output: TypleteMarkdownOutput }
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

		return `<${tag} class="typlete-markdown typlete-markdown-${token.mode}">${svg}</${tag}>`;
	}

	if (options.output === 'markdown-image') {
		const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
		return `![${escapeMarkdownAlt(token.source)}](${uri})`;
	}

	if (options.output === 'asset') {
		if (!options.assetDir) {
			throw new Error('transformTypleteMarkdown: assetDir is required when output="asset".');
		}

		const assetBaseUrl = normalizeAssetBaseUrl(options.assetBaseUrl ?? '');
		const hash = hashToken(token);
		const filename = `typlete-${hash}.svg`;
		const filepath = join(options.assetDir, filename);

		await mkdir(options.assetDir, { recursive: true });
		await writeFile(filepath, svg, 'utf8');

		return `![${escapeMarkdownAlt(token.source)}](${assetBaseUrl}${filename})`;
	}

	return '';
}

function renderComponentToken(
	token: TypleteMarkdownToken,
	options: TransformTypleteMarkdownOptions
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

function collectFencedCodeBlocks(markdown: string): MarkdownFence[] {
	const fences: MarkdownFence[] = [];
	let index = 0;

	while (index < markdown.length) {
		const openingLine = readLine(markdown, index);
		const opening = openingLine.text.match(/^[ \t]{0,3}(`{3,}|~{3,})([^`~\r\n]*)$/);

		if (!opening) {
			index = openingLine.end;
			continue;
		}

		const start = index;
		const marker = opening[1];
		const info = opening[2]?.trim() ?? '';
		const markerChar = marker[0];
		const markerLength = marker.length;
		const contentStart = openingLine.end;

		index = openingLine.end;

		while (index < markdown.length) {
			const closingLine = readLine(markdown, index);
			const closing = closingLine.text.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);

			if (closing && closing[1][0] === markerChar && closing[1].length >= markerLength) {
				fences.push({
					start,
					end: closingLine.end,
					contentStart,
					contentEnd: index,
					info
				});
				index = closingLine.end;
				break;
			}

			index = closingLine.end;
		}

		if (index >= markdown.length) {
			break;
		}
	}

	return fences;
}

function readLine(input: string, start: number): { text: string; end: number } {
	const newline = input.indexOf('\n', start);
	const end = newline === -1 ? input.length : newline + 1;
	const text = input.slice(start, newline === -1 ? end : newline).replace(/\r$/, '');

	return { text, end };
}

function normalizeFenceContent(content: string): string {
	return content.replace(/\r?\n$/, '');
}

function getConsumedClosingLineEnding(markdown: string, fenceEnd: number): string {
	if (fenceEnd >= 2 && markdown.slice(fenceEnd - 2, fenceEnd) === '\r\n') return '\r\n';
	if (fenceEnd >= 1 && markdown[fenceEnd - 1] === '\n') return '\n';
	return '';
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
	const importSource = options.componentImportSource ?? 'typlete';

	if (!content.includes(`<${inlineName}`) && !content.includes(`<${blockName}`)) {
		return content;
	}

	if (hasTypleteComponentImports(content, inlineName, blockName, importSource)) {
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

function hasTypleteComponentImports(
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

function hashToken(token: TypleteMarkdownToken): string {
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
