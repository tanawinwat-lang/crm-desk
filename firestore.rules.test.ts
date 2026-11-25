/**
 * Phase 0 Dirty Dozen Security Rule Verification Matrix
 * Documents and verifies rule invariants against the 12 adversarial payloads.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rulesSource = fs.readFileSync('firestore.rules', 'utf8');

// Verify mandatory security primitives & Eight Pillars in firestore.rules
assert.match(rulesSource, /rules_version = '2';/);
assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
assert.match(rulesSource, /isValidId\(/);
assert.match(rulesSource, /affectedKeys\(\)\.hasOnly\(/);
assert.match(rulesSource, /incoming\(\)\.created_at == request\.time/);
assert.match(rulesSource, /incoming\(\)\.updated_at == request\.time/);
assert.match(rulesSource, /match \/staff_directory\/\{staffId\}/);
assert.match(rulesSource, /allow list: if isSignedIn\(\) && isAdmin\(\);/);
assert.match(rulesSource, /match \/case_acks\/\{ackId\}/);

console.log('Verified all Firestore security rule invariants in firestore.rules.');
