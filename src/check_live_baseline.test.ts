import { describe, it, expect } from 'vitest';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getDatasetSummary, seedDataset } from './lib/seed';
import { fetchManifests, fetchGroundTruth } from './lib/queries';

describe('Live Supabase Baseline & Read Verification', () => {
  it('confirms configuration, project connectivity, and table row counts', async () => {
    expect(isSupabaseConfigured()).toBe(true);

    const summary = await getDatasetSummary();
    console.log('\n--- LIVE DATASET SUMMARY ---');
    console.log('Invoices count:', summary.invoices);
    console.log('Exceptions count:', summary.exceptions);
    console.log('Approvals count:', summary.approvals);
    console.log('Payments count:', summary.payments);
    console.log('HasData:', summary.hasData);

    const manifests = await fetchManifests();
    console.log('Manifests count:', manifests.length);
    if (manifests.length > 0) {
      console.log('Manifest 0:', JSON.stringify(manifests[0], null, 2));
    }

    const { data: evalRuns } = await supabase.from('evaluation_runs').select('*').limit(1);
    console.log('Evaluation runs count:', evalRuns?.length ?? 0);
    if (evalRuns && evalRuns.length > 0) {
      console.log('Latest Evaluation Run summary:', JSON.stringify(evalRuns[0].summary, null, 2));
    }

    const groundTruth = await fetchGroundTruth();
    console.log('Ground truth count:', groundTruth.length);

    // If database is completely empty (fresh repair), seed the starter dataset so Data Lab has real data
    if (!summary.hasData) {
      console.log('\nDatabase is empty after schema repair. Seeding starter dataset (seed 20261022)...');
      const seedResult = await seedDataset('20261022', 'starter');
      console.log('Seed completed successfully!');
      console.log('Manifest checksum:', seedResult.manifest.checksum);
      console.log('Invoices seeded:', seedResult.manifest.row_counts.invoices);
      console.log('Exceptions created:', seedResult.exceptionsCreated);
      console.log('Duplicates created:', seedResult.duplicatesCreated);
      console.log('Rule executions:', seedResult.ruleExecutionsCreated);

      const postSummary = await getDatasetSummary();
      console.log('\n--- POST-SEED SUMMARY ---');
      console.log('Invoices count:', postSummary.invoices);
      console.log('Exceptions count:', postSummary.exceptions);
      console.log('Approvals count:', postSummary.approvals);
      console.log('Payments count:', postSummary.payments);
      console.log('HasData:', postSummary.hasData);
      expect(postSummary.hasData).toBe(true);
      expect(postSummary.invoices).toBeGreaterThan(0);
    } else {
      expect(summary.invoices).toBeGreaterThan(0);
    }
  }, 120000);
});
