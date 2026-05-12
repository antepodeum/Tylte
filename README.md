# Tylte

Svelte 5 components and Markdown helpers for rendering Typst math or raw Typst markup as SVG.

## Requirements

- Svelte `>= 5.36`
- Svelte async rendering enabled with `compilerOptions.experimental.async = true`
- Vite/SvelteKit-compatible asset handling for browser WASM imports

```js
// svelte.config.js
export default {
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};
```

## Install

```bash
pnpm add tylte
```

## Svelte usage

```svelte
<script lang="ts">
	import { TypstInline, TypstBlock } from 'tylte';
</script>

<p>
	Inline formula: <TypstInline source="integral_0^1 x^2 dif x" />
</p>

<TypstBlock source="sum_(i=1)^n i = (n(n+1)) / 2" />
```

`source` is Typst math by default. Do not include `$...$` in math mode.

## Raw Typst

Use `inputMode="raw"` when `source` is a Typst markup fragment that should not be wrapped as math.

```svelte
<TypstBlock inputMode="raw" source={'#rect(radius: 6pt, inset: 10pt)[#strong[Raw Typst]]'} />
```

```svelte
<!-- math mode: Tylte wraps source in Typst math -->
<TypstInline source="alpha + beta" />

<!-- raw mode: Tylte passes source to Typst unchanged -->
<TypstInline inputMode="raw" source={'$alpha + beta$'} />
```

`inputMode="markup"` is accepted as a compatibility alias for `raw`.

## Props

`Typst`, `TypstInline`, and `TypstBlock` support these common props:

```ts
type TypstMode = 'inline' | 'block';
type TypstInputMode = 'math' | 'raw' | 'markup';

type TypstSvgSanitizer = (svg: string) => string;

source?: string;
inputMode?: TypstInputMode;
preamble?: string;
textSize?: string;
pageMargin?: string;
cache?: boolean;
sanitize?: TypstSvgSanitizer;
ariaLabel?: string;
title?: string;
loadingLabel?: string;
throwOnError?: boolean;
errorMode?: 'badge' | 'none';
class?: string;
```

`Typst` also accepts `mode`. `TypstInline` and `TypstBlock` set `mode` automatically.

## SSR and browser WASM

During SSR/build, Tylte renders SVG on the server. After hydration, the browser keeps the server-rendered SVG and loads the Typst WASM runtime only when the formula has to be rendered again on the client.

The browser compiler and renderer WASM files are imported as Vite assets. Consumers do not need to copy WASM files manually.

## Error behavior

By default, render failures keep the last successful SVG visible and show a small error badge.

```svelte
<TypstBlock source={formula} errorMode="badge" />
<TypstBlock source={formula} errorMode="none" />
```

Use `throwOnError={true}` when server-side render failures should fail the request/build instead of being converted to component state.

## Server helper

```ts
import { renderTypstSvgServer } from 'tylte/server';

const svg = await renderTypstSvgServer({
	source: 'integral_0^1 x^2 dif x',
	mode: 'block',
	inputMode: 'math',
	preamble: '',
	textSize: '11pt',
	pageMargin: '0pt',
	cache: true
});
```

## Markdown shortcodes

Tylte uses explicit `{{...}}` shortcodes. Typst code fences remain source code and are not rendered.

```md
{{math-inline}}

{{ math-block }}

{{~raw-inline~}}

{{~ raw-block ~}}
```

Block shortcodes must be the only non-whitespace content on their Markdown line. A spaced shortcode embedded inside a paragraph is rendered inline to avoid invalid Markdown/HTML nesting.

```md
The value is {{ alpha + beta }} here.

{{ alpha + beta }}
```

To write the shortcode literally, escape the opening braces:

```md
\{{alpha + beta}}
```

Shortcodes are not processed inside fenced code, indented code, inline code spans, HTML comments, `<script>` blocks, or `<style>` blocks.

````md
```typst
{{alpha + beta}}
#rect[in source code]
```
````

## Markdown transform

```ts
import { transformTylteMarkdown } from 'tylte/markdown';

const output = await transformTylteMarkdown(markdown, {
	output: 'component'
});
```

Output modes:

```ts
type TylteMarkdownOutput = 'component' | 'html' | 'markdown-image' | 'asset';
```

### Component output

Best for MDsveX/Svelte-aware Markdown pipelines.

```ts
await transformTylteMarkdown(markdown, {
	output: 'component'
});
```

Produces Svelte component tags:

```svelte
<TypstInline source={"alpha + beta"} />
<TypstBlock source={"#rect[hello]"} inputMode="raw" />
```

### HTML output

Best for renderers that accept raw HTML/SVG.

```ts
await transformTylteMarkdown(markdown, {
	output: 'html'
});
```

This renders SVG immediately and inserts it into the Markdown output.

### Markdown image output

Best for renderers that do not support raw HTML but accept Markdown images.

```ts
await transformTylteMarkdown(markdown, {
	output: 'markdown-image'
});
```

This renders SVG and inserts it as a `data:image/svg+xml` Markdown image.

### Asset output

Best for static sites.

```ts
await transformTylteMarkdown(markdown, {
	output: 'asset',
	assetDir: 'static/tylte',
	assetBaseUrl: '/tylte'
});
```

This writes SVG files to `assetDir` and inserts normal Markdown image links.

## MDsveX preprocessor

Run the Tylte preprocessor before MDsveX so Markdown shortcodes are converted to Svelte component tags before MDsveX compiles the document.

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-auto';
import { mdsvex } from 'mdsvex';
import { createTypstMdsvexPreprocessor } from 'tylte/markdown';

const config = {
	extensions: ['.svelte', '.svx', '.md'],
	preprocess: [
		createTypstMdsvexPreprocessor({
			output: 'component'
		}),
		mdsvex({
			extensions: ['.svx', '.md']
		})
	],
	compilerOptions: {
		experimental: {
			async: true
		}
	},
	kit: {
		adapter: adapter()
	}
};

export default config;
```

For `output: 'component'`, the preprocessor injects this import when a document contains Tylte shortcodes:

```svelte
<script lang="ts">
	import { TypstInline, TypstBlock } from 'tylte';
</script>
```

Disable injection only if another MDsveX hook already imports the components:

```ts
createTypstMdsvexPreprocessor({
	output: 'component',
	injectComponentImports: false
});
```

## Rendering options for Markdown

Markdown helpers accept the same render options as component/server rendering:

```ts
await transformTylteMarkdown(markdown, {
	output: 'asset',
	assetDir: 'static/tylte',
	assetBaseUrl: '/tylte',
	preamble: '',
	textSize: '11pt',
	pageMargin: '0pt',
	cache: true
});
```

## Sanitizing SVG

Tylte strips embedded SVG `<script>` tags by default. For stricter sanitizing, pass a sanitizer.

DOMPurify is optional:

```ts
import { createDomPurifySvgSanitizer } from 'tylte/sanitizers/dompurify';

const sanitize = await createDomPurifySvgSanitizer();
```

Server-side DOMPurify requires both `dompurify` and `jsdom`:

```ts
import { createServerDomPurifySvgSanitizer } from 'tylte/server/dompurify';

const sanitize = await createServerDomPurifySvgSanitizer();
```

## Limitations

- Component SSR depends on Svelte experimental async rendering.
- Markdown shortcodes intentionally do not reuse the `typst` code-fence language; fences are preserved for syntax highlighting and source examples.
- Server rendering temporarily guards Typst runtime fetches so SvelteKit does not track external runtime fetches during SSR.
- `html`, `markdown-image`, and `asset` output modes pre-render SVG immediately and are not reactive on the client.
