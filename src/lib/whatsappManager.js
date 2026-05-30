client.on("qr", async (qr) => {
  console.log(`📱 QR generated for user ${userId}`);

  const session = await upsertSession(userId, {
    qrCode: qr,
    status: "QR_READY",
    isReady: false,
    lastActivity: new Date(),
  });

  emitRealtime(userId, "whatsapp:qr", {
    qrCode: qr,
    status: "QR_READY",
    isReady: false,
  });

  emitRealtime(userId, "whatsapp:status", session);
});
