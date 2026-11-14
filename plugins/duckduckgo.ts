import { duckduckgo } from '../src/search/web.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'duckduckgo', search: duckduckgo } satisfies Plugin;
