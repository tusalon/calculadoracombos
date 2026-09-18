/* Conexión con Supabase — rellena estos dos valores con los de tu proyecto.
 *
 * Los encuentras en: supabase.com → tu proyecto → Settings → API
 *   SUPABASE_URL  = "Project URL"
 *   SUPABASE_KEY  = "Project API keys" → la clave **anon / public**
 *
 * La clave anon es pública por diseño y puede vivir en el repositorio: lo que
 * protege los datos son las reglas RLS de supabase.sql, no el secreto de la clave.
 * La que NUNCA debe aparecer aquí es la "service_role" — esa se salta todas las reglas.
 */

export const SUPABASE_URL = 'https://ealypjhqelecmvpozaoa.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhbHlwamhxZWxlY212cG96YW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3Mzg3NzAsImV4cCI6MjEwNTMxNDc3MH0.YPDO_S2y5j61Kgeg6PZtwCTngtRkodh2v1BWvpA__Jw';

export const configurado = () => !!(SUPABASE_URL && SUPABASE_KEY);
