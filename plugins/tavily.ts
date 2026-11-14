import { tavily } from '../src/search/apis.ts';
import type { Plugin } from '../src/types.ts';

export default { id: 'tavily', search: tavily } satisfies Plugin;
