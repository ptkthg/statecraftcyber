export interface SearchResult {
  type: "briefing" | "ioc" | "noticia" | "cve"
  id: string
  title: string
  href: string
  meta: string
  rank: number
  isMono?: boolean
}
