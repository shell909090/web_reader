import { brave } from '../src/search/apis.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'brave', search: brave } satisfies Plugin;
