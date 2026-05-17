-- AlterTable
ALTER TABLE "CveCache" ADD COLUMN     "aiPriority" TEXT,
ADD COLUMN     "mitigation" TEXT,
ADD COLUMN     "ptBrDescription" TEXT;
