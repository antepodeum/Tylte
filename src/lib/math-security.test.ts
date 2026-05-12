import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTypstDocument, escapeTypstMathSource } from './document.ts';
import { transformTypleteMarkdown } from './markdown.ts';

const baseOptions = {
	preamble: '',
	textSize: '11pt',
	pageMargin: '0pt',
	cache: true
};

describe('Typst math source escaping', () => {
	it('leaves plain Typst math syntax unchanged', () => {
		assert.equal(
			escapeTypstMathSource('sum_(i=1)^n i = (n(n+1)) / 2'),
			'sum_(i=1)^n i = (n(n+1)) / 2'
		);

		const document = createTypstDocument({
			...baseOptions,
			source: 'sum_(i=1)^n i = (n(n+1)) / 2',
			mode: 'block',
			inputMode: 'math'
		});

		assert.match(document, /#align\(center\)\[\$ sum_\(i=1\)\^n i/);
	});

	it('escapes math delimiters instead of rejecting them', () => {
		assert.equal(
			escapeTypstMathSource('x$ #image("evil.svg") $y'),
			'x\\$ \\#image("evil.svg") \\$y'
		);

		const document = createTypstDocument({
			...baseOptions,
			source: 'x$ #image("evil.svg") $y',
			mode: 'block',
			inputMode: 'math'
		});

		assert.match(document, /x\\\$ \\\#image\("evil\.svg"\) \\\$y/);
	});

	it('does not double-escape already escaped math delimiters', () => {
		assert.equal(escapeTypstMathSource('x\\$ y\\# z'), 'x\\$ y\\# z');
		assert.equal(escapeTypstMathSource('x\\\\$ y\\\\# z'), 'x\\\\\\$ y\\\\\\# z');
	});

	it('keeps the injected closing math delimiter separate from trailing source backslashes', () => {
		const document = createTypstDocument({
			...baseOptions,
			source: 'x\\',
			mode: 'inline',
			inputMode: 'math'
		});

		assert.match(document, /#box\[\$ x\\ \$\]/);
	});

	it('allows markdown math fences that contain delimiter-like characters', async () => {
		const output = await transformTypleteMarkdown(
			'```typlete-math\nx$ #image("evil.svg") $y\n```',
			{
				output: 'component'
			}
		);

		assert.equal(output.trim(), '<TypstBlock source={"x$ #image(\\"evil.svg\\") $y"} />');
	});

	it('does not escape raw Typst fragments as math', () => {
		const document = createTypstDocument({
			...baseOptions,
			source: '$x$ #image("diagram.svg")',
			mode: 'block',
			inputMode: 'raw'
		});

		assert.match(document, /\$x\$ #image\("diagram\.svg"\)/);
	});
});
