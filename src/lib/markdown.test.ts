import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTypstMdsvexPreprocessor, transformTylteMarkdown } from './markdown.ts';

describe('transformTylteMarkdown component output', () => {
	it('renders namespaced Tylte fences as raw Typst blocks', async () => {
		const output = await transformTylteMarkdown(
			[
				'Before',
				'',
				'```tylte-typst',
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

	it('renders namespaced Tylte math fences as math blocks', async () => {
		const output = await transformTylteMarkdown('```tylte-math\nalpha + beta\n```', {
			output: 'component'
		});

		assert.equal(output, '<TypstBlock source={"alpha + beta"} />');
	});

	it('preserves normal Typst source fences and old moustache text', async () => {
		const input = [
			'{{this is not Tylte syntax anymore}}',
			'',
			'```typst',
			'#rect[plain Typst source code]',
			'```',
			'',
			'````md',
			'```tylte-typst',
			'#rect[in rendered example source]',
			'```',
			'````',
			'',
			'```ts',
			'const x = "{{value}}";',
			'```'
		].join('\n');

		const output = await transformTylteMarkdown(input, { output: 'component' });

		assert.equal(output, input);
	});

	it('supports long fences and tilde fences', async () => {
		const output = await transformTylteMarkdown(
			[
				'~~~~tylte-raw',
				'#rect[hello]',
				'~~~~',
				'',
				'````tylte-typst-math',
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
			content: '```tylte-typst\n#rect[hello]\n```',
			filename: 'page.svx'
		});

		assert.match(code, /import \{ TypstInline, TypstBlock \} from "tylte";/);
		assert.match(code, /<TypstBlock source=\{"#rect\[hello\]"\} inputMode="raw" \/>/);
	});

	it('aliases imports when custom component names are requested', async () => {
		const preprocessor = createTypstMdsvexPreprocessor({
			componentInlineName: 'TInline',
			componentBlockName: 'TBlock'
		});
		const { code } = await preprocessor.markup({
			content: '```tylte math\nalpha\n```',
			filename: 'page.svx'
		});

		assert.match(code, /import \{ TypstInline as TInline, TypstBlock as TBlock \} from "tylte";/);
		assert.match(code, /<TBlock source=\{"alpha"\} \/>/);
	});

	it('does not duplicate existing imports', async () => {
		const preprocessor = createTypstMdsvexPreprocessor();
		const content = [
			'<script lang="ts">',
			'\timport { TypstBlock, TypstInline } from "tylte";',
			'</script>',
			'',
			'```tylte-typst',
			'#rect[hello]',
			'```'
		].join('\n');
		const { code } = await preprocessor.markup({ content, filename: 'page.svx' });

		assert.equal(code.match(/from "tylte"/g)?.length, 1);
	});
});
