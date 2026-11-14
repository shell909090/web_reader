import { baidu } from '../src/search/web.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'baidu', search: baidu } satisfies Plugin;
