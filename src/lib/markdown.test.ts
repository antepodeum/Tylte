import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTypstMdsvexPreprocessor, transformTypleteMarkdown } from './markdown.ts';

describe('transformTypleteMarkdown component output', () => {
	it('renders namespaced Typlete fences as raw Typst blocks', async () => {
		const output = await transformTypleteMarkdown(
			[
				'Before',
				'',
				'```typlete-typst',
				'#set text(size: 12pt)',
				'#rect[hello]',
				'```',
				'',
				'After'
			].join('\n'),
			{ output: 'component' }
		);

		assert.equal(
			output,
			[
				'Before',
				'',
				'<TypstBlock source={"#set text(size: 12pt)\\n#rect[hello]"} inputMode="raw" />',
				'',
				'After'
			].join('\n')
		);
	});

	it('renders namespaced Typlete math fences as math blocks', async () => {
		const output = await transformTypleteMarkdown('```typlete-math\nalpha + beta\n```', {
			output: 'component'
		});

		assert.equal(output, '<TypstBlock source={"alpha + beta"} />');
	});

	it('preserves normal Typst source fences and old moustache text', async () => {
		const input = [
			'{{this is not Typlete syntax anymore}}',
			'',
			'```typst',
			'#rect[plain Typst source code]',
			'```',
			'',
			'````md',
			'```typlete-typst',
			'#rect[in rendered example source]',
			'```',
			'````',
			'',
			'```ts',
			'const x = "{{value}}";',
			'```'
		].join('\n');

		const output = await transformTypleteMarkdown(input, { output: 'component' });

		assert.equal(output, input);
	});

	it('supports long fences and tilde fences', async () => {
		const output = await transformTypleteMarkdown(
			[
				'~~~~typlete-raw',
				'#rect[hello]',
				'~~~~',
				'',
				'````typlete-typst-math',
				'sum_(i=1)^n i',
				'````'
			].join('\n'),
			{ output: 'component' }
		);

		assert.equal(
			output,
			[
				'<TypstBlock source={"#rect[hello]"} inputMode="raw" />',
				'',
				'<TypstBlock source={"sum_(i=1)^n i"} />'
			].join('\n')
		);
	});
});

describe('createTypstMdsvexPreprocessor', () => {
	it('injects imports for generated default components', async () => {
		const preprocessor = createTypstMdsvexPreprocessor();
		const { code } = await preprocessor.markup({
			content: '```typlete-typst\n#rect[hello]\n```',
			filename: 'page.svx'
		});

		assert.match(code, /import \{ TypstInline, TypstBlock \} from "typlete";/);
		assert.match(code, /<TypstBlock source=\{"#rect\[hello\]"\} inputMode="raw" \/>/);
	});

	it('aliases imports when custom component names are requested', async () => {
		const preprocessor = createTypstMdsvexPreprocessor({
			componentInlineName: 'TInline',
			componentBlockName: 'TBlock'
		});
		const { code } = await preprocessor.markup({
			content: '```typlete math\nalpha\n```',
			filename: 'page.svx'
		});

		assert.match(code, /import \{ TypstInline as TInline, TypstBlock as TBlock \} from "typlete";/);
		assert.match(code, /<TBlock source=\{"alpha"\} \/>/);
	});

	it('does not duplicate existing imports', async () => {
		const preprocessor = createTypstMdsvexPreprocessor();
		const content = [
			'<script lang="ts">',
			'\timport { TypstBlock, TypstInline } from "typlete";',
			'</script>',
			'',
			'```typlete-typst',
			'#rect[hello]',
			'```'
		].join('\n');
		const { code } = await preprocessor.markup({ content, filename: 'page.svx' });

		assert.equal(code.match(/from "typlete"/g)?.length, 1);
	});
});
