import {expect,it} from 'vitest';
import {requireLocalDatabase} from '../lib/publication/local-database';
it('allows only the installed local database and never a remote export connection',()=>{
  expect(requireLocalDatabase('postgresql://statecraft:password@127.0.0.1:5432/statecraft')).toContain('127.0.0.1');
  for(const value of ['postgresql://remote.neon.tech/statecraft','postgresql://127.0.0.1/other','postgresql://127.0.0.1:5433/statecraft','https://localhost/statecraft','postgresql://statecraft:password@127.0.0.1:5432/statecraft?host=remote.example','']) expect(()=>requireLocalDatabase(value)).toThrow('local_database_required');
});
