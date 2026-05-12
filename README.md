# Tylte

Svelte 5 components for rendering Typst math and raw Typst as SVG.

## Install

```bash
pnpm add tylte
```

## Usage

```svelte
<script lang="ts">
	import { TypstInline, TypstBlock } from 'tylte';
</script>

<p>
	Inline: <TypstInline source="integral_0^1 x^2 dif x" />
</p>

<TypstBlock source="sum_(i=1)^n i = (n(n+1)) / 2" />

<TypstBlock inputMode="raw" source={'#rect(radius: 6pt, inset: 10pt)[#strong[Raw Typst]]'} />
```

## SSR

Components are SSR-first when Svelte async rendering is enabled.

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

During SSR/build, Tylte uses `@myriaddreamin/typst.ts` without the native
`@myriaddreamin/typst-ts-node-compiler` package. This avoids `.node` binary crashes in
Vite/Rolldown and Node 24. If SSR rendering fails, the component falls back to browser
rendering after hydration instead of crashing the dev server.

In the browser, the Typst compiler and renderer WASM files are bundled automatically via
Vite asset imports. Consumers do not need to copy WASM files manually.

## Props

`Typst`, `TypstInline` and `TypstBlock` support:

```ts
type TypstInputMode = 'math' | 'raw' | 'markup';
type TypstMode = 'inline' | 'block';
```

`markup` is kept as an alias for `raw`.

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
throwOnError?: boolean;
class?: string;
```

## Server helpers

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

## Markdown / MDsveX helper

```ts
import { preRenderTypstMarkdown } from 'tylte/markdown';

const htmlLikeMarkdown = await preRenderTypstMarkdown(markdown);
```

Supported markers:

````md
{{typst alpha + beta}}

```typst-math
sum_(i=1)^n i = (n(n+1)) / 2
```

```typst
#rect(inset: 8pt)[Raw Typst]
```
````

## Sanitizing

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
