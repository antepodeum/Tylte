import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTypstMdsvexPreprocessor, transformTylteMarkdown } from './markdown.ts';

describe('transformTylteMarkdown component output', () => {
	it('renders inline and standalone block shortcodes', async () => {
		const output = await transformTylteMarkdown(
			'The value is {{ alpha + beta }} here.\n\n{{ alpha + beta }}',
			{ output: 'component' }
		);

		assert.match(output, /The value is <TypstInline source=\{"alpha \+ beta"\} \/> here\./);
		assert.match(output, /^<TypstBlock source=\{"alpha \+ beta"\} \/>$/m);
	});

	it('preserves escaped shortcodes and Markdown code regions', async () => {
		const input = [
			'\\{{literal}}',
			'`{{inline-code}}`',
			'````md',
			'{{fenced-code}}',
			'````',
			'    {{indented-code}}',
			'<script>const value = "{{script}}";</script>',
			'<!-- {{comment}} -->'
		].join('\n');

		const output = await transformTylteMarkdown(input, { output: 'component' });

		assert.equal(output, input.replace('\\{{literal}}', '{{literal}}'));
	});

	it('trims raw shortcode delimiter whitespace and preserves block intent', async () => {
		const output = await transformTylteMarkdown('{{~ #rect[hello] ~}}', {
			output: 'component'
		});

		assert.equal(output, '<TypstBlock source={"#rect[hello]"} inputMode="raw" />');
	});
});

describe('createTypstMdsvexPreprocessor', () => {
	it('injects imports for generated default components', async () => {
		const preprocessor = createTypstMdsvexPreprocessor();
		const { code } = await preprocessor.markup({ content: '{{alpha}}', filename: 'page.svx' });

		assert.match(code, /import \{ TypstInline, TypstBlock \} from "tylte";/);
		assert.match(code, /<TypstInline source=\{"alpha"\} \/>/);
	});

	it('aliases imports when custom component names are requested', async () => {
		const preprocessor = createTypstMdsvexPreprocessor({
			componentInlineName: 'TInline',
			componentBlockName: 'TBlock'
		});
		const { code } = await preprocessor.markup({ content: '{{alpha}}', filename: 'page.svx' });

		assert.match(
			code,
			/import \{ TypstInline as TInline, TypstBlock as TBlock \} from "tylte";/
		);
		assert.match(code, /<TInline source=\{"alpha"\} \/>/);
	});

	it('does not duplicate existing imports', async () => {
		const preprocessor = createTypstMdsvexPreprocessor();
		const content = [
			'<script lang="ts">',
			'\timport { TypstBlock, TypstInline } from "tylte";',
			'</script>',
			'',
			'{{alpha}}'
		].join('\n');
		const { code } = await preprocessor.markup({ content, filename: 'page.svx' });

		assert.equal(code.match(/from "tylte"/g)?.length, 1);
	});
});
