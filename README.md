# Tylte

Svelte 5 components and Markdown helpers for rendering Typst math and raw Typst as SVG.

Tylte is SSR-first when possible, keeps the rendered SVG interactive after hydration, and only loads the browser Typst WASM compiler when a formula actually needs to be re-rendered on the client.

## Install

```bash
pnpm add tylte
```

## Basic usage

```svelte
<script lang="ts">
	import { TypstInline, TypstBlock } from 'tylte';
</script>

<p>
	Inline formula: <TypstInline source="integral_0^1 x^2 dif x" />
</p>

<TypstBlock source="sum_(i=1)^n i = (n(n+1)) / 2" />
```

By default, `source` is interpreted as Typst math syntax. Do not include `$...$` yourself in math mode.

## Raw Typst

Use `inputMode="raw"` when `source` is a full Typst fragment instead of only a formula body.

```svelte
<TypstBlock inputMode="raw" source={'#rect(radius: 6pt, inset: 10pt)[#strong[Raw Typst]]'} />
```

Difference:

```txt
inputMode="math"
  source = formula body
  Tylte wraps it as Typst math

inputMode="raw"
  source = Typst markup as-is
  Tylte does not wrap it
```

Examples:

```svelte
<!-- math mode -->
<TypstInline source="alpha + beta" />

<!-- raw mode -->
<TypstInline inputMode="raw" source={'$alpha + beta$'} />
```

## Props

`Typst`, `TypstInline`, and `TypstBlock` support:

```ts
type TypstMode = 'inline' | 'block';
type TypstInputMode = 'math' | 'raw' | 'markup';
```

`markup` is kept as a compatibility alias for `raw`.

Common props:

```ts
source?: string;
inputMode?: TypstInputMode;
preamble?: string;
textSize?: string;
pageMargin?: string;
cache?: boolean;
sanitize?: (svg: string) => string;
ariaLabel?: string;
title?: string;
loadingLabel?: string;
throwOnError?: boolean;
class?: string;
```

`Typst` also accepts `mode`. `TypstInline` and `TypstBlock` set it for you.

## SSR and lazy WASM

For component-level SSR, enable Svelte async rendering:

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

During SSR/build, Tylte tries to render SVG on the server. After hydration, the browser keeps the SSR SVG and does not load the Typst WASM compiler immediately.

The browser compiler and renderer WASM files are bundled automatically through Vite asset imports. Consumers do not need to copy WASM files manually.

The browser Typst runtime is loaded only when the component has to re-render after a client-side change to `source`, `inputMode`, `preamble`, `textSize`, `pageMargin`, or related render options.

## Error behavior

When rendering fails, avoid replacing the whole formula area with a large error dump. Prefer keeping the last successful SVG visible and showing only a small error indicator in UI code.

Use `throwOnError={true}` only when you want render failures to propagate to the caller.

```svelte
<TypstBlock source={formula} throwOnError={false} />
```

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

Tylte uses explicit `{{...}}` shortcodes for Markdown. Ordinary Typst code fences are left alone, so users can still write and display Typst source code.

```md
{{ math-block }}
{{math-inline}}

{{~ raw-block ~}}
{{~raw-inline~}}
```

Rules:

```txt
{{ expr }}
  math block

{{expr}}
  math inline

{{~ expr ~}}
  raw Typst block

{{~expr~}}
  raw Typst inline
```

The whitespace is meaningful:

```md
{{ alpha + beta }} <!-- block math -->
{{alpha + beta}} <!-- inline math -->

{{~ #rect[hello] ~}} <!-- block raw Typst -->
{{~#strong[hello]~}} <!-- inline raw Typst -->
```

To write the shortcode literally, escape the opening braces:

```md
\{{alpha + beta}}
```

## Typst source code in Markdown

A normal Typst fence remains source code:

````md
```typst
#let x = 1
#rect[in source code]
```
````

Tylte does not render that fence automatically.

This avoids stealing the `typst` language name from code highlighters and Markdown renderers.

## Markdown transform

```ts
import { transformTylteMarkdown } from 'tylte/markdown';

const output = await transformTylteMarkdown(markdown, {
	output: 'component'
});
```

Available output modes:

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

Produces Svelte component tags such as:

```svelte
<TypstInline source={'alpha + beta'} />
<TypstBlock source={'#rect[hello]'} inputMode="raw" />
```

The components stay SSR-first and can still re-render on the client when props change.

### HTML output

Best for renderers that accept raw HTML/SVG.

```ts
await transformTylteMarkdown(markdown, {
	output: 'html'
});
```

This renders SVG immediately and injects it into the Markdown output.

Do not use this mode with Markdown renderers that strip or ignore raw HTML.

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

```ts
import { createTypstMdsvexPreprocessor } from 'tylte/markdown';

const typst = createTypstMdsvexPreprocessor({
	output: 'component'
});
```

Then make `TypstInline` and `TypstBlock` available to the rendered MDsveX content, for example in a layout or wrapper component:

```svelte
<script lang="ts">
	import { TypstInline, TypstBlock } from 'tylte';
</script>

<slot />
```

## Rendering options for Markdown

Markdown helpers accept the same render options as components/server rendering:

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

## Escaping and limitations

Shortcodes are not processed inside fenced code blocks.

````md
```md
{{alpha + beta}}
{{~ #rect[hello] ~}}
```
````

````

For multiline Typst, use block forms:

```md
{{~
#set text(size: 12pt)
#rect(inset: 8pt)[hello]
~}}
````
