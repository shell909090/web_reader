import { parallel } from '../src/search/remote.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'parallel', search: parallel } satisfies Plugin;
