import { firecrawl } from '../src/search/remote.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'firecrawl', search: firecrawl } satisfies Plugin;
