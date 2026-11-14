import { bing } from '../src/search/web.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'bing', search: bing } satisfies Plugin;
