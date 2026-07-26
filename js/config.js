// ============================================================
// js/config.js — Configuración de RULETA AQUI LICOR (Supabase)
// ============================================================

const APP_CONFIG = {

  // ─── Supabase Credentials ──────────────────────────────
  supabaseUrl: "https://wpkhtwztjtuehqsrwrku.supabase.co",
  supabaseKey: "sb_publishable_962BojdLvTqVLnhwuuyObQ_bOtxIbfa",

  // ─── Seguridad del Panel Admin ────────────────────────────
  adminPassword: "admin123",

  // ─── URL de producción ────────────────────────────────────
  // Los QR generados apuntarán a este dominio público
  domain: "https://aquilicor-ruleta.netlify.app",

  // ─── Datos del Sorteo ─────────────────────────────────────
  storeName: "RULETA AQUI LICOR",
  premio: "Premio Sorpresa del Mes",

  // ─── Tablas de Supabase ───────────────────────────────────
  tables: {
    tokens:          "tokens",
    participaciones: "participaciones",
    ganadores:       "ganadores",
    config:          "config"
  }
};

if (typeof module !== 'undefined') module.exports = APP_CONFIG;
