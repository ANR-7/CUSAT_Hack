import { createApp, isGeminiConfigured } from './app.js';
import { db, isSupabaseConfigured } from './store.js';

const PORT = Number(process.env.PORT) || 4000;
const app = createApp();

void db.initSupabasePersistence().then((status) => {
  console.log(
    `[Revive Server] Supabase: configured=${isSupabaseConfigured()} connected=${status.connected} mode=${status.persistenceMode}`
  );
  console.log(
    `[Revive Server] Gemini AI: configured=${isGeminiConfigured()} model=${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}`
  );
  console.log(`[Revive Server] Payments: DEMO MODE ONLY`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Revive Server] API listening on http://localhost:${PORT}`);
});
