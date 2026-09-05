import test from 'node:test';
import assert from 'node:assert/strict';
import { site } from '../src/lib/site.ts';

test('canonical origin is a valid web URL', () => {
  assert.ok(['http:', 'https:'].includes(new URL(site.url).protocol));
});
