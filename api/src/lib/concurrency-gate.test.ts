import { describe, expect, test } from 'bun:test';
import { ConcurrencyGate } from './concurrency-gate';

describe('ConcurrencyGate', () => {
  test('limits each key and the total, and frees a slot on release', () => {
    const gate = new ConcurrencyGate(2, 1);
    const a = gate.tryEnter('a');
    expect(a).not.toBeNull();
    expect(gate.tryEnter('a')).toBeNull();
    const b = gate.tryEnter('b');
    expect(b).not.toBeNull();
    expect(gate.tryEnter('c')).toBeNull();

    a!();
    a!();
    expect(gate.tryEnter('c')).not.toBeNull();
    expect(gate.tryEnter('a')).toBeNull();
    b!();
    expect(gate.tryEnter('a')).not.toBeNull();
  });
});
