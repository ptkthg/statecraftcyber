/** The local publishing workflow must never fall back to a remote database. */
export function requireLocalDatabase(value=process.env.DATABASE_URL) {
  try {
    const url=new URL(value ?? '');
    if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.port!=='5432' || url.pathname!=='/statecraft' || url.username!=='statecraft' || url.search || url.hash) throw new Error();
    return value!;
  } catch { throw new Error('local_database_required'); }
}
