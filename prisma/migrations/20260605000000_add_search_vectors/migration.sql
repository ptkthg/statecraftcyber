-- AddSearchVectors: tsvector columns with GIN indexes for full-text search
-- Uses GENERATED ALWAYS so PostgreSQL keeps the column in sync automatically.

ALTER TABLE "Briefing"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX "briefing_search_idx" ON "Briefing" USING GIN("search_vector");

ALTER TABLE "NewsCache"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '')
    )
  ) STORED;

CREATE INDEX "newscache_search_idx" ON "NewsCache" USING GIN("search_vector");
