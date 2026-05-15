-- CreateTable
CREATE TABLE "NewsCache" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsCache_pkey" PRIMARY KEY ("slug")
);
