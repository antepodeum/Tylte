export function hashCacheKey(input: string): string {
	let hash = 0x811c9dc5;

	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return `${input.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}
