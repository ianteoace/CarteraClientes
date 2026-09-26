ALTER TYPE "WorkspacePermission" ADD VALUE IF NOT EXISTS 'ORDER_VIEW';
ALTER TYPE "WorkspacePermission" ADD VALUE IF NOT EXISTS 'ORDER_CREATE';
ALTER TYPE "WorkspacePermission" ADD VALUE IF NOT EXISTS 'ORDER_EDIT';
ALTER TYPE "WorkspacePermission" ADD VALUE IF NOT EXISTS 'ORDER_MANAGE_STATUS';
ALTER TYPE "WorkspacePermission" ADD VALUE IF NOT EXISTS 'ORDER_MANAGE_PAYMENT';

CREATE TABLE "OrderDetails" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "fulfillmentType" TEXT NOT NULL DEFAULT 'PICKUP',
    "fulfillmentNotes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderDetails_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderCaseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderDetails_caseId_key" ON "OrderDetails"("caseId");
CREATE INDEX "OrderItem_orderCaseId_position_idx" ON "OrderItem"("orderCaseId", "position");

ALTER TABLE "OrderDetails" ADD CONSTRAINT "OrderDetails_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderCaseId_fkey"
FOREIGN KEY ("orderCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
