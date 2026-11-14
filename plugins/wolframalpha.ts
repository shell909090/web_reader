import { wolframalpha } from '../src/search/knowledge.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'wolframalpha', search: wolframalpha } satisfies Plugin;
