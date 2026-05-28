# Render Backend Deploy

Use PostgreSQL on Render, then set these environment variables:

- DATABASE_URL
- JWT_SECRET
- GROQ_API_KEY
- FRONTEND_URL
- ENABLE_WHATSAPP=false initially

Build command:

```bash
npm install
```

Start command:

```bash
npm run render:start
```

Important: enable WhatsApp only after the basic backend + database works.
