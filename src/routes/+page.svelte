<script lang="ts">
  import { TypstBlock, TypstInline } from '$lib';

  let inlineSource = $state('integral_0^1 x^2 dif x');
  let blockSource = $state('sum_(i=1)^n i = (n(n+1)) / 2');
  let rawSource = $state('#rect(radius: 6pt, inset: 10pt)[#strong[Raw Typst] block]');
  let textSize = $state('11pt');
</script>

<svelte:head>
  <title>Tylte demo</title>
  <meta
    name="description"
    content="Svelte 5 components for rendering Typst inline, block and raw Typst as SVG."
  />
</svelte:head>

<main class="page">
  <section class="hero">
    <p class="eyebrow">Tylte</p>
    <h1>Svelte 5 components for Typst formulas</h1>
    <p class="lead">
      Render Typst math and raw Typst as SVG. Components try SSR first and keep working
      interactively in the browser after hydration.
    </p>
  </section>

  <section class="card">
    <div class="card-heading">
      <h2>Inline formula</h2>
      <p>
        This sentence contains
        <TypstInline
          source={inlineSource}
          {textSize}
          ariaLabel="Integral from zero to one of x squared dx"
        />
        rendered inline.
      </p>
    </div>

    <label>
      Inline source
      <input bind:value={inlineSource} spellcheck="false" />
    </label>
  </section>

  <section class="card">
    <div class="card-heading">
      <h2>Block formula</h2>
      <TypstBlock
        source={blockSource}
        {textSize}
        ariaLabel="Sum from i equals one to n of i equals n times n plus one divided by two"
      />
    </div>

    <label>
      Block source
      <textarea bind:value={blockSource} spellcheck="false"></textarea>
    </label>
  </section>

  <section class="card">
    <div class="card-heading">
      <h2>Raw Typst</h2>
      <TypstBlock source={rawSource} inputMode="raw" {textSize} />
    </div>

    <label>
      Raw Typst source
      <textarea bind:value={rawSource} spellcheck="false"></textarea>
    </label>
  </section>

  <section class="card compact">
    <h2>Per-component options</h2>
    <label>
      Text size
      <select bind:value={textSize}>
        <option value="10pt">10pt</option>
        <option value="11pt">11pt</option>
        <option value="12pt">12pt</option>
        <option value="14pt">14pt</option>
      </select>
    </label>

    <pre>{`<TypstInline source="${inlineSource}" textSize="${textSize}" />
<TypstBlock source="${blockSource}" textSize="${textSize}" />
<TypstBlock source="${rawSource}" inputMode="raw" textSize="${textSize}" />`}</pre>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    color: #161616;
    background: #f6f4ef;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .page {
    width: min(960px, calc(100% - 32px));
    margin: 0 auto;
    padding: 56px 0;
  }

  .hero {
    margin-bottom: 28px;
  }

  .eyebrow {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b6257;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    max-width: 760px;
    margin-bottom: 12px;
    font-size: clamp(2.25rem, 7vw, 4.75rem);
    line-height: 0.95;
    letter-spacing: -0.07em;
  }

  h2 {
    margin-bottom: 12px;
    font-size: 1.2rem;
  }

  .lead {
    max-width: 680px;
    color: #4b473f;
    font-size: 1.1rem;
    line-height: 1.6;
  }

  .card {
    display: grid;
    gap: 22px;
    padding: 24px;
    margin-top: 18px;
    border: 1px solid #ded8cd;
    border-radius: 24px;
    background: #fffdf8;
    box-shadow: 0 16px 45px rgb(47 38 20 / 0.08);
  }

  .compact {
    gap: 14px;
  }

  .card-heading p {
    margin-bottom: 0;
    font-size: 1.08rem;
    line-height: 1.65;
  }

  label {
    display: grid;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    color: #5b544b;
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid #d8d0c4;
    border-radius: 14px;
    padding: 12px 14px;
    font: inherit;
    background: #fff;
    color: #161616;
  }

  textarea {
    min-height: 96px;
    resize: vertical;
  }

  pre {
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      monospace;
  }

  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
