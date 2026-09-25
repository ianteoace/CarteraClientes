-- Preserve the user-entered phone while introducing its canonical identifier.
ALTER TABLE "Client" ADD COLUMN "phoneNormalized" TEXT;

-- Existing values were pre-audited for invalid formats and canonical collisions.
UPDATE "Client"
SET "phoneNormalized" = regexp_replace("phone", '[+\s\-()]', '', 'g');

ALTER TABLE "Client" ALTER COLUMN "phoneNormalized" SET NOT NULL;

DROP INDEX "Client_phone_key";

CREATE UNIQUE INDEX "Client_phoneNormalized_key" ON "Client"("phoneNormalized");
