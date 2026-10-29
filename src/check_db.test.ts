import { describe, it } from 'vitest';
import { supabase, isSupabaseConfigured } from './lib/supabase';

describe('Database table existence verification', () => {
  it('checks all 21 tables and RPCs in Supabase', async () => {
    console.log('isSupabaseConfigured:', isSupabaseConfigured());
    
    const tables = [
      'users',
      'vendors',
      'purchase_orders',
      'purchase_order_lines',
      'goods_receipts',
      'goods_receipt_lines',
      'invoices',
      'invoice_lines',
      'approvals',
      'payments',
      'exceptions',
      'exception_assignments',
      'duplicate_findings',
      'audit_events',
      'state_transitions',
      'extraction_attempts',
      'config_settings',
      'generation_manifests',
      'evaluation_runs',
      'ground_truth',
      'rule_executions'
    ];

    const results = await Promise.all(
      tables.map(async (table) => {
        try {
          const { error } = await supabase.from(table).select('*').limit(1);
          if (error) {
            return { table, exists: false, status: `FAIL [${error.code}]: ${error.message}` };
          }
          return { table, exists: true, status: 'PASS: Table exists and is accessible' };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { table, exists: false, status: `EXCEPTION: ${msg}` };
        }
      })
    );

    console.log('\n--- TABLE VERIFICATION REPORT ---');
    let passCount = 0;
    for (const r of results) {
      if (r.exists) passCount++;
      console.log(`${r.table.padEnd(25)}: ${r.status}`);
    }
    console.log(`\nTables verified: ${passCount} / ${tables.length} exist.`);

    // Check RPCs
    try {
      const { error } = await supabase.rpc('decide_approval_secure', {
        p_approval_id: 'test',
        p_invoice_id: 'test',
        p_decision: 'REJECTED',
        p_actor_user_id: 'test',
        p_reason: 'test'
      });
      if (error && error.message.includes('Could not find the function')) {
        console.log('decide_approval_secure   : MISSING [PGRST202]');
      } else {
        console.log('decide_approval_secure   : PASS (Function found)');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('decide_approval_secure   : ' + msg);
    }

    try {
      const { error } = await supabase.rpc('schedule_payment_secure', {
        p_invoice_id: 'test',
        p_actor_user_id: 'test'
      });
      if (error && error.message.includes('Could not find the function')) {
        console.log('schedule_payment_secure  : MISSING [PGRST202]');
      } else {
        console.log('schedule_payment_secure  : PASS (Function found)');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('schedule_payment_secure  : ' + msg);
    }
  }, 30000);
});
