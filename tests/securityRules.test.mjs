// Static guard against accidentally loosening firestore.rules. This is not a
// substitute for real enforcement testing — that needs the Firebase Local
// Emulator Suite + @firebase/rules-unit-testing driving actual reads/writes
// as two different uids (see README "Testing" section for how to add that
// once the Firebase CLI is available in this environment) — but it catches
// the common regression of someone loosening the match pattern or the
// auth.uid comparison by hand.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assert, section, summary } from './helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

console.log('securityRules.test.mjs');

section('User isolation is enforced at the rules layer (rule 10)');
{
  assert(/match \/users\/\{uid\}/.test(rules), 'rules scope user data under users/{uid}');
  assert(/request\.auth\.uid == uid/.test(rules), 'rules compare the authenticated uid against the path uid, not just checking auth != null');
  assert(/allow read, write: if false/.test(rules), 'a default-deny catch-all exists for everything outside users/{uid}');
}

summary('securityRules.test.mjs');
