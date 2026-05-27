-- CreateTable
CREATE TABLE "StoreSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeName" TEXT,
    "storeDescription" TEXT,
    "aiTone" TEXT NOT NULL DEFAULT 'friendly',
    "aiLanguage" TEXT NOT NULL DEFAULT 'arabic',
    "welcomeMessage" TEXT,
    "shippingPolicy" TEXT,
    "paymentPolicy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSetting_userId_key" ON "StoreSetting"("userId");
