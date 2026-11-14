import { searxng } from '../src/search/searxng.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'searxng', search: searxng } satisfies Plugin;
