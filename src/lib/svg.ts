const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const EVENT_HANDLER_QUOTED_PATTERN = /\s+on[a-z][\w:-]*\s*=\s*(['"])[\s\S]*?\1/gi;
const EVENT_HANDLER_UNQUOTED_PATTERN = /\s+on[a-z][\w:-]*\s*=\s*[^\s>]+/gi;
const JAVASCRIPT_HREF_PATTERN = /\s+(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi;

export function stripSvgScripts(svg: string): string {
	return svg
		.replace(SCRIPT_TAG_PATTERN, '')
		.replace(EVENT_HANDLER_QUOTED_PATTERN, '')
		.replace(EVENT_HANDLER_UNQUOTED_PATTERN, '')
		.replace(JAVASCRIPT_HREF_PATTERN, '');
}
