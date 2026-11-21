import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL, { schema: 'statecraft_checkpoints' });
  try { await saver.setup(); console.log('Checkpoint schema ready'); } finally { await saver.end(); }
}
main().catch(() => { console.error('checkpoint_setup_failed'); process.exitCode = 1; });
