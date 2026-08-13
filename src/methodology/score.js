// Deterministic scoring — computed in code from trait verdicts, never by the
// model. met = 1, partial = 0.5, missed = 0; weighted by the pack's trait
// weights; not_applicable traits are excluded from the denominator.
// A verdict flagged `unverified` by the gate scores as if partial were the
// ceiling: unproven "met" must not inflate the number.

const VALUE = { met: 1, partial: 0.5, missed: 0 };

export function scoreCall(pack, gated) {
  const byId = new Map(pack.traits.map((t) => [t.id, t]));
  let num = 0;
  let den = 0;
  const rows = [];

  for (const t of gated.traits) {
    const def = byId.get(t.id);
    if (!def) continue;
    if (t.verdict === 'not_applicable') {
      rows.push({ id: t.id, name: def.name, verdict: t.verdict, weight: def.weight, points: null });
      continue;
    }
    let value = VALUE[t.verdict] ?? 0;
    if (t.unverified) value = Math.min(value, VALUE.partial);
    num += value * def.weight;
    den += def.weight;
    rows.push({ id: t.id, name: def.name, verdict: t.verdict, unverified: t.unverified === true, weight: def.weight, points: value });
  }

  const score = den === 0 ? 0 : Math.round((num / den) * 100);
  return { score, rows };
}
