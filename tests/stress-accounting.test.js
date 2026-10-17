import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSetAccounting } from '../scripts/qualification-stress.mjs';
test('stress accounting rejects corrupted grouped per-set telemetry', () => {
  for (const group of ['shots', 'hands', 'situations', 'serveTypes', 'reasons']) {
    assertSetAccounting({ [group]: { count: 3 } }, [{ [group]: { count: 1 } }, { [group]: { count: 2 } }]);
    assert.throws(() => assertSetAccounting({ [group]: { count: 3 } }, [{ [group]: { count: 2 } }, { [group]: { count: 2 } }]), new RegExp(group));
    assert.throws(() => assertSetAccounting({ [group]: {} }, [{ [group]: { unexpected: 1 } }]), /unexpected/);
  }
  assertSetAccounting({ tossQualitySum: .3 }, [{ tossQualitySum: .1 }, { tossQualitySum: .2 }]);
});
