const { execSync } = require('child_process');
const DB_URL = "postgresql://postgres:P85HQ%5E4Z%26vqJ%23XY@db.wazkylxgqckjfkcmfotl.supabase.co:5432/postgres";

const queries = [
  { label: '1. Count duplicates', sql: `SELECT prediction_id, COUNT(*) as cnt FROM prediction_history GROUP BY prediction_id HAVING COUNT(*) > 1 ORDER BY cnt DESC;` },
  { label: '2. Constraints on prediction_history', sql: `SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'prediction_history'::regclass;` },
  { label: '3. Trigger function code', sql: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'verify_user_predictions_after_draw';` },
  { label: '4. Triggers on official_draws', sql: `SELECT trigger_name, event_manipulation, action_timing, action_statement, tgenabled FROM pg_trigger WHERE tgrelid = 'official_draws'::regclass;` },
  { label: '5. Delete duplicates (keep earliest)', sql: `DELETE FROM prediction_history WHERE id NOT IN (SELECT MIN(id) FROM prediction_history GROUP BY prediction_id);` },
  { label: '6. Add unique constraint', sql: `ALTER TABLE prediction_history ADD CONSTRAINT prediction_history_prediction_id_unique UNIQUE (prediction_id);` },
  { label: '7. Verify no more duplicates', sql: `SELECT prediction_id, COUNT(*) as cnt FROM prediction_history GROUP BY prediction_id HAVING COUNT(*) > 1;` },
];

for (const q of queries) {
  console.log('\n' + '='.repeat(60));
  console.log(q.label);
  console.log('='.repeat(60));
  try {
    const result = execSync(
      `npx supabase db query --db-url "${DB_URL}" "${q.sql}"`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(result);
  } catch (err) {
    console.log(err.stdout || '');
    console.error(err.stderr || err.message);
  }
}
