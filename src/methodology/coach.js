// Coaching report renderer — deterministic markdown from pack + gated verdicts
// + score. The digestible per-rep artifact: what you nailed, what to check,
// and for every gap: why it matters, the next-call move, and a line you could
// actually say. The gap text comes from the scoring call (call-specific); the
// why/move/line come from the pack (methodology-canonical). No second LLM call.

const BADGE = {
  met: '✅', partial: '🟡', missed: '🔴', not_applicable: '⚪',
};

export function renderCoaching(pack, gated, scored, { transcriptName = 'call' } = {}) {
  const byId = new Map(pack.traits.map((t) => [t.id, t]));
  const lines = [];

  lines.push(`# ${pack.name} scorecard — ${transcriptName}`);
  lines.push('');
  lines.push(`**Score: ${scored.score}/100** · call type: ${gated.call_type} · evidence verified: ${gated.gate.evidence_verified}/${gated.gate.evidence_total}`);
  lines.push('');
  lines.push(gated.overall_note);
  lines.push('');
  lines.push('| Trait | Verdict | Weight | Evidence |');
  lines.push('|---|---|---|---|');
  for (const t of gated.traits) {
    const def = byId.get(t.id);
    if (!def) continue;
    const flags = [
      t.unverified ? 'UNVERIFIED — evidence failed the gate' : null,
      !t.unverified && t.confidence < 0.6 && t.verdict !== 'not_applicable' ? 'low confidence — check this' : null,
    ].filter(Boolean).join('; ');
    const ev = t.evidence
      .filter((e) => e.status !== 'demoted')
      .map((e) => `“${truncate(e.quote, 70)}” [${e.segment}]`)
      .join('<br>') || '—';
    lines.push(`| ${def.name} | ${BADGE[t.verdict]} ${t.verdict}${flags ? ` (${flags})` : ''} | ${def.weight} | ${ev} |`);
  }

  const gaps = gated.traits.filter((t) => t.verdict === 'missed' || t.verdict === 'partial' || t.unverified);
  if (gaps.length > 0) {
    lines.push('');
    lines.push('## Coaching — close these before the next call');
    for (const t of gaps.sort((a, b) => (byId.get(b.id)?.weight ?? 0) - (byId.get(a.id)?.weight ?? 0))) {
      const def = byId.get(t.id);
      if (!def) continue;
      lines.push('');
      lines.push(`### ${def.name} — ${t.verdict}${t.unverified ? ' (unverified)' : ''}`);
      if (t.gap) lines.push(`**On this call:** ${t.gap}`);
      lines.push(`**Why it matters:** ${def.coaching.why_it_matters}`);
      lines.push(`**Next move:** ${def.coaching.next_move}`);
      lines.push(`**Try saying:** “${def.coaching.example_line}”`);
    }
  } else {
    lines.push('');
    lines.push('## Coaching');
    lines.push('Every applicable trait was met and verified. Ship this call to the team as an example.');
  }

  return lines.join('\n');
}

function truncate(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
