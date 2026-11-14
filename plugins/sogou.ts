import { sogou } from '../src/search/web.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'sogou', search: sogou } satisfies Plugin;
