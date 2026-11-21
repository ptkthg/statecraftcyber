import { Annotation, StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';

// Only durable batch/event identifiers travel through checkpoints. Source payloads
// and editorial transactions remain in the existing auditable database pipeline.
const State = Annotation.Root({
  collected: Annotation<string[]>,
  queue: Annotation<string[]>,
  cursor: Annotation<number>,
});
export interface UpdateSteps {
  collect(): Promise<string[]>;
  observe(batches: string[]): Promise<string[]>;
  process(eventId: string): Promise<void>;
  finish(): Promise<void>;
  enrichNews?(): Promise<void>;
}
export function createUpdateGraph(steps: UpdateSteps, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(State)
    .addNode('collect', async () => ({ collected: await steps.collect() }))
    .addNode('observe', async state => ({ queue: await steps.observe(state.collected), cursor: 0 }))
    .addNode('process', async state => {
      await steps.process(state.queue[state.cursor]);
      return { cursor: state.cursor + 1 };
    })
    .addNode('finish', async () => { await steps.finish(); return {}; })
    .addNode('enrichNews', async () => { await steps.enrichNews?.(); return {}; })
    .addEdge(START, 'collect')
    .addEdge('collect', 'observe')
    .addConditionalEdges('observe', state => state.queue.length ? 'process' : 'enrichNews')
    .addConditionalEdges('process', state => state.cursor < state.queue.length ? 'process' : 'enrichNews')
    .addEdge('enrichNews', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}
