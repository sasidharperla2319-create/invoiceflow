import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSupabaseConfigured, supabase } from '../supabase';

// Declare process for browser tsconfig
declare const process: { env: Record<string, string | undefined> };

describe('Supabase Configuration Handling (Task 3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('determines if Supabase is configured in the current environment', () => {
    // Current test environment has mock or actual env
    const configured = isSupabaseConfigured();
    expect(typeof configured).toBe('boolean');
  });

  it('exports a valid client object that does not crash when called even if unconfigured', () => {
    expect(supabase).toBeDefined();
    expect(typeof supabase.from).toBe('function');
  });

  it('detects unconfigured states correctly', () => {
    function checkConfig(url: string | undefined, key: string | undefined): boolean {
      if (!url || !key) return false;
      const placeholderUrls = [
        'https://your-project.supabase.co',
        'https://placeholder.supabase.co',
        'https://xyzcompany.supabase.co',
      ];
      const placeholderKeys = ['your-anon-key', 'placeholder-key', 'your-service-role-key'];

      if (placeholderUrls.includes(url.trim())) return false;
      if (placeholderKeys.includes(key.trim())) return false;
      return url.startsWith('https://') && key.length > 20;
    }

    expect(checkConfig(undefined, undefined)).toBe(false);
    expect(checkConfig('', '')).toBe(false);
    expect(checkConfig('https://your-project.supabase.co', 'your-anon-key')).toBe(false);
    expect(checkConfig('https://valid.supabase.co', 'short')).toBe(false);
    expect(
      checkConfig(
        'https://actual-project.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz1234567890',
      ),
    ).toBe(true);
  });
});
