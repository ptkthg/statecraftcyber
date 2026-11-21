import { expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { createUpdateGraph } from '../lib/pipeline/graph';

it('resumes after generation without recollecting or regenerating completed items', async () => {
  const completed: string[] = [];
  let collections = 0, crash = true;
  const graph = createUpdateGraph({
    collect: async () => { collections++; return ['a', 'b']; },
    observe: async (items) => items,
    process: async id => { if (id === 'b' && crash) { crash = false; throw new Error('interrupted'); } completed.push(id); },
    finish: async () => {},
  }, new MemorySaver());
  const config = { configurable: { thread_id: 'resume-test' }, durability: 'sync' as const };
  await expect(graph.invoke({ collected: [], queue: [], cursor: 0 }, config)).rejects.toThrow('interrupted');
  await graph.invoke(null, config);
  expect(collections).toBe(1);
  expect(completed).toEqual(['a', 'b']);
});

it('completes a healthy run with no new items', async () => {
  let finished = false;
  const graph = createUpdateGraph({ collect: async () => [], observe: async () => [], process: async () => { throw new Error('unexpected'); }, finish: async () => { finished = true; } }, new MemorySaver());
  await graph.invoke({ collected: [], queue: [], cursor: 0 }, { configurable: { thread_id: 'empty' } });
  expect(finished).toBe(true);
});
