import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ??
  '';

const rawKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  '';

function cleanEnv(value: string | undefined): string {
  if (!value) return '';
  let cleaned = value.trim().replace(/^["']|["']$/g, '').trim();
  // Auto-correct common accidental paste typo 'ysb_' -> 'sb_'
  if (cleaned.startsWith('ysb_')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

const cleanedUrl = cleanEnv(rawUrl);
const cleanedKey = cleanEnv(rawKey);

export function isSupabaseConfigured(): boolean {
  if (!cleanedUrl || !cleanedKey) return false;
  if (
    cleanedUrl === '' ||
    cleanedKey === '' ||
    cleanedUrl === 'https://your-project.supabase.co' ||
    cleanedKey === 'your-anon-key' ||
    cleanedUrl.includes('your-project') ||
    cleanedKey.includes('your-anon-key')
  ) {
    return false;
  }
  return true;
}

// Fallback placeholder credentials so createClient doesn't throw during initial module evaluation
const safeUrl = isSupabaseConfigured() ? cleanedUrl : 'https://placeholder.supabase.co';
const safeKey = isSupabaseConfigured() ? cleanedKey : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
  auth: { persistSession: false },
});

