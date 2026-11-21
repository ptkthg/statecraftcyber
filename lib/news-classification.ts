const ALERT_PATTERNS = /(corrige|patch|atualiza[çc][ãa]o|urgente|explorad[ao]|exploit|zero-day|kev|mitiga[çc][ãa]o)/i;
/** Pure classification shared by client filters and server statistics. */
export function classifyNewsTitle(title: string): 'alert' | 'context' {
  return ALERT_PATTERNS.test(title) ? 'alert' : 'context';
}
