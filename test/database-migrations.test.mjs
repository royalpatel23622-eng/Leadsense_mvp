import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readMigration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const profileRevoke = /revoke\s+execute\s+on\s+function\s+public\.create_app_user_profile\s*\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i;

test('profile trigger remains installed while its SECURITY DEFINER RPC is not granted to API roles', async () => {
  const accountMigration = await readMigration('002_accounts_search_history.sql');
  const hardeningMigration = await readMigration('007_restrict_profile_trigger_rpc.sql');
  const triggerPosition = accountMigration.indexOf('create trigger create_app_user_profile_after_signup');
  const revokePosition = accountMigration.indexOf('revoke execute on function public.create_app_user_profile()');

  assert.notEqual(triggerPosition, -1);
  assert.ok(revokePosition > triggerPosition, 'revoke follows trigger creation on clean installs');
  assert.match(accountMigration, profileRevoke);
  assert.match(hardeningMigration, profileRevoke);
  assert.doesNotMatch(hardeningMigration, /drop\s+trigger|drop\s+function|delete\s+from/i);
});
