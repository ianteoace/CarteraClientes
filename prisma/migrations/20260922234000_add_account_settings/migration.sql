CREATE TABLE "AccountSettings" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSettings_ownerId_key" ON "AccountSettings"("ownerId");
