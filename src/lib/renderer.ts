import type { TypstInputMode, TypstMode, TypstResolvedRendererOptions } from './config.ts';
import { createTypstDocument } from './document.ts';
import { hashCacheKey } from './hash.ts';
import { stripSvgScripts } from './svg.ts';

export interface TypstRenderRequest extends TypstResolvedRendererOptions {
	source: string;
	mode: TypstMode;
	inputMode: TypstInputMode;
}

export interface TypstRenderResult {
	svg: string;
	error: string;
	ssrFailed: boolean;
}

interface TypstApi {
	svg(input: { mainContent: string }): Promise<string>;
	setCompilerInitOptions?: (options: { getModule: () => string }) => void;
	setRendererInitOptions?: (options: { getModule: () => string }) => void;
}

let typstPromise: Promise<TypstApi> | null = null;
let browserWasmConfigured = false;

const svgCache = new Map<string, Promise<string>>();
const MAX_CACHE_SIZE = 300;

export { createTypstDocument } from './document.ts';

export function createTypstRenderKey(options: TypstRenderRequest): string {
	return hashCacheKey(createTypstDocument(options));
}

export async function renderTypstSvg(options: TypstRenderRequest): Promise<string> {
	const cacheKey = createTypstRenderKey(options);
	const mainContent = createTypstDocument(options);

	const compile = async () => {
		const typst = await getTypst();
		return withTypstRuntimeGuards(() => typst.svg({ mainContent }));
	};

	let rawSvgPromise = options.cache ? svgCache.get(cacheKey) : undefined;

	if (!rawSvgPromise) {
		rawSvgPromise = compile();

		if (options.cache) {
			remember(cacheKey, rawSvgPromise);
			rawSvgPromise.catch(() => {
				svgCache.delete(cacheKey);
			});
		}
	}

	const rawSvg = await rawSvgPromise;
	const safeSvg = stripSvgScripts(rawSvg);

	return options.sanitize ? options.sanitize(safeSvg) : safeSvg;
}

export async function renderTypstSvgResult(
	options: TypstRenderRequest,
	throwOnError = false
): Promise<TypstRenderResult> {
	try {
		return {
			svg: await renderTypstSvg(options),
			error: '',
			ssrFailed: false
		};
	} catch (err) {
		if (throwOnError) {
			throw err;
		}

		const message = err instanceof Error ? err.message : String(err);
		const ssrFailed = typeof window === 'undefined';

		return {
			svg: '',
			error: ssrFailed ? '' : message,
			ssrFailed
		};
	}
}

export function clearTypstSvgCache(): void {
	svgCache.clear();
}

function remember(key: string, value: Promise<string>): void {
	if (svgCache.size >= MAX_CACHE_SIZE) {
		const firstKey = svgCache.keys().next().value;
		if (firstKey) svgCache.delete(firstKey);
	}

	svgCache.set(key, value);
}

async function withTypstRuntimeGuards<T>(fn: () => Promise<T>): Promise<T> {
	return withDeprecatedWasmInitWarningFilter(() => {
		if (typeof window !== 'undefined') {
			return fn();
		}

		return withUntrackedServerFetch(fn);
	});
}

async function withDeprecatedWasmInitWarningFilter<T>(fn: () => Promise<T>): Promise<T> {
	if (typeof console === 'undefined' || typeof console.warn !== 'function') {
		return fn();
	}

	const originalWarn = console.warn;

	console.warn = (...args: unknown[]) => {
		const message = String(args[0] ?? '');

		if (message.includes('using deprecated parameters for the initialization function')) {
			return;
		}

		originalWarn(...args);
	};

	try {
		return await fn();
	} finally {
		console.warn = originalWarn;
	}
}

let serverFetchQueue: Promise<unknown> = Promise.resolve();

function withUntrackedServerFetch<T>(fn: () => Promise<T>): Promise<T> {
	const run = async () => {
		const originalFetch = globalThis.fetch;

		if (typeof originalFetch !== 'function') {
			return fn();
		}

		globalThis.fetch = createUntrackedServerFetch(originalFetch) as typeof fetch;

		try {
			return await fn();
		} finally {
			globalThis.fetch = originalFetch;
		}
	};

	const result = serverFetchQueue.then(run, run);
	serverFetchQueue = result.then(
		() => undefined,
		() => undefined
	);

	return result;
}

function createUntrackedServerFetch(originalFetch: typeof fetch): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = getFetchUrl(input);
		const method = getFetchMethod(input, init);

		if (!url || !/^https?:\/\//i.test(url) || (method !== 'GET' && method !== 'HEAD')) {
			return originalFetch(input, init);
		}

		return fetchViaNodeHttp(url, method, init?.headers ?? getFetchHeaders(input));
	}) as typeof fetch;
}

function getFetchUrl(input: RequestInfo | URL): string {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
	return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function getFetchHeaders(input: RequestInfo | URL): HeadersInit | undefined {
	return input instanceof Request ? input.headers : undefined;
}

async function fetchViaNodeHttp(
	url: string,
	method: string,
	headersInit?: HeadersInit
): Promise<Response> {
	const moduleName = url.startsWith('https://') ? 'node:https' : 'node:http';
	const { request } = await import(/* @vite-ignore */ moduleName);
	const headers = Object.fromEntries(new Headers(headersInit).entries());

	return new Promise<Response>((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const req = request(url, { method, headers }, (res: any) => {
			const chunks: Buffer[] = [];

			res.on('data', (chunk: Buffer<ArrayBufferLike>) => {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});

			res.on('end', () => {
				const responseHeaders = new Headers();

				for (const [name, value] of Object.entries(res.headers)) {
					if (Array.isArray(value)) {
						for (const item of value) responseHeaders.append(name, item);
					} else if (value !== undefined) {
						responseHeaders.set(name, String(value));
					}
				}

				resolve(
					new Response(method === 'HEAD' ? null : Buffer.concat(chunks), {
						status: res.statusCode ?? 200,
						statusText: res.statusMessage,
						headers: responseHeaders
					})
				);
			});
		});

		req.on('error', reject);
		req.end();
	});
}

async function getTypst(): Promise<TypstApi> {
	if (!typstPromise) {
		typstPromise = import('@myriaddreamin/typst.ts').then(({ $typst }) => $typst as TypstApi);
	}

	const typst = await typstPromise;

	if (typeof window !== 'undefined' && !browserWasmConfigured) {
		const { TYPST_COMPILER_ASSET, TYPST_RENDERER_ASSET } = await import('./wasm.ts');

		typst.setCompilerInitOptions?.({
			getModule: () => TYPST_COMPILER_ASSET
		});

		typst.setRendererInitOptions?.({
			getModule: () => TYPST_RENDERER_ASSET
		});

		browserWasmConfigured = true;
	}

	return typst;
}
