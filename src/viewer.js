// Slice-1 viewer: pure view-model helpers (node-testable) + browser render.
// One interaction: click a claim → its cited line highlights → audio seeks and
// plays at that second. blocked_injection is quarantined, never in notes body.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Closed enums (technical-spec-core §2). Anything outside them fails CLOSED at
// the boundary — a typo'd status must never render a claim into the main list.
const CLAIM_STATUSES = new Set(['verified', 'segment_corrected', 'uncorroborated', 'blocked_injection']);

export function buildViewModel(bundle) {
  const uttById = new Map();
  for (const u of bundle.transcript.utterances) {
    if (!Number.isInteger(u.id)) {
      throw new Error(`utterance id must be an integer, got: ${JSON.stringify(u.id)}`);
    }
    uttById.set(u.id, u);
  }

  const claims = bundle.claims.map((claim) => {
    if (!CLAIM_STATUSES.has(claim.status)) {
      throw new Error(`unknown claim.status ${JSON.stringify(claim.status)} — closed enum, failing closed`);
    }
    const primary = claim.evidence?.[0] ?? null;
    const anchored = claim.status === 'verified' || claim.status === 'segment_corrected';
    if (anchored && primary && !uttById.has(primary.utterance_id)) {
      throw new Error(`claim ${claim.id} cites utterance ${primary.utterance_id} which is not in the bundle — exports must be self-contained`);
    }
    return {
      id: claim.id,
      extractor: claim.extractor,
      text: claim.text,
      status: claim.status,
      anchor: anchored && primary ? {
        utterance_id: primary.utterance_id,
        quote: primary.quote,
        t_start: primary.t_start,
        match_type: primary.match_type,
      } : null,
      offending: claim.status === 'blocked_injection' ? primary?.quote ?? '' : null,
    };
  });

  const blocked = new Set(claims.filter((c) => c.status === 'blocked_injection').map((c) => c.id));
  for (const section of bundle.notes.sections) {
    for (const block of section.blocks) {
      for (const id of block.claim_ids) {
        if (blocked.has(id)) {
          throw new Error(`notes block references blocked_injection claim ${id} — the notes body must never contain a blocked claim`);
        }
      }
    }
  }

  // The gate's own scorecard, always on screen: what shipped AND what was
  // dropped/demoted/blocked. Nothing is silently removed (L7).
  const counts = { verified: 0, segment_corrected: 0, uncorroborated: 0, blocked_injection: 0 };
  for (const c of claims) counts[c.status] += 1;

  return {
    title: bundle.call?.title ?? bundle.call?.id ?? 'call',
    coverage: bundle.notes.coverage,          // rendered verbatim, never recomputed
    counts,
    utterances: bundle.transcript.utterances,
    uttById,                                  // id-keyed — array order is NOT id order
    claims,
    quarantine: claims.filter((c) => c.status === 'blocked_injection'),
    sections: bundle.notes.sections,
    provenance: bundle.provenance ?? null,
  };
}

// ── browser side ───────────────────────────────────────────────────────────
const BADGE = {
  verified: '✓ verified',
  segment_corrected: '✓ corrected',
  uncorroborated: '⚠ no verified line',
  blocked_injection: '⛔ injection blocked',
};

export function render(vm, root, audio) {
  root.innerHTML = `
    <header>
      <div>
        <h1>${escapeHtml(vm.title)}</h1>
        <span class="counts">✓ ${vm.counts.verified} verified · ${vm.counts.segment_corrected} corrected · ⚠ ${vm.counts.uncorroborated} uncorroborated · ⛔ ${vm.counts.blocked_injection} blocked — dropped claims stay visible, nothing is silently removed</span>
      </div>
      <span class="band">${escapeHtml(vm.coverage.band)} · ${Math.round(vm.coverage.ratio * 100)}% verified</span>
    </header>
    <main>
      <section id="notes">
        ${vm.sections.map((s) => `
          <h2>${escapeHtml(s.title)}</h2>
          ${s.blocks.map((b) => `<p class="block">${escapeHtml(b.text)}</p>`).join('')}`).join('')}
        <h2>Claims</h2>
        ${vm.claims.filter((c) => c.status !== 'blocked_injection').map((c) => `
          <div class="claim ${c.status}" data-id="${escapeHtml(c.id)}">
            <span class="badge">${BADGE[c.status] ?? escapeHtml(c.status)}</span>
            <p>${escapeHtml(c.text)}</p>
          </div>`).join('')}
        ${vm.quarantine.length ? `<h2>Quarantined</h2>` : ''}
        ${vm.quarantine.map((c) => `
          <div class="claim blocked_injection">
            <span class="badge">${BADGE.blocked_injection}</span>
            <p><s>${escapeHtml(c.text)}</s></p>
            <p class="offending">line: “${escapeHtml(c.offending)}”</p>
          </div>`).join('')}
      </section>
      <section id="transcript">
        ${vm.utterances.map((u) => `
          <div class="utt" data-utt="${escapeHtml(u.id)}">
            <span class="ts">[${formatTime(u.start)}]</span>
            ${u.speaker ? `<span class="spk">${escapeHtml(u.speaker)}:</span>` : ''}
            <span class="txt">${escapeHtml(u.text)}</span>
          </div>`).join('')}
      </section>
    </main>`;

  root.querySelectorAll('.claim[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const claim = vm.claims.find((c) => c.id === el.dataset.id);
      root.querySelectorAll('.utt.active').forEach((n) => n.classList.remove('active'));
      root.querySelectorAll('.claim.active').forEach((n) => n.classList.remove('active'));
      el.classList.add('active');
      if (!claim?.anchor) return;                     // demoted claims have nothing to prove
      const source = vm.uttById.get(claim.anchor.utterance_id);  // id-keyed, survives reordering
      const utt = root.querySelector(`.utt[data-utt="${Number(claim.anchor.utterance_id)}"]`);
      if (!utt || !source) return;
      utt.classList.add('active');
      const txt = utt.querySelector('.txt');
      const raw = source.text;
      const idx = raw.indexOf(claim.anchor.quote);
      if (idx >= 0) {
        txt.innerHTML = `${escapeHtml(raw.slice(0, idx))}<mark>${escapeHtml(claim.anchor.quote)}</mark>${escapeHtml(raw.slice(idx + claim.anchor.quote.length))}`;
      }
      utt.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (audio && Number.isFinite(claim.anchor.t_start)) {
        audio.currentTime = claim.anchor.t_start;
        audio.play();
      }
    });
  });
}

// Boot only in a browser; node imports the pure helpers above. Two fuel lines:
// tier-1 export inlines the bundle as #og-data (no server, no audio — the
// footer player is removed); app mode fetches from the local server.
if (typeof document !== 'undefined') {
  const inline = document.getElementById('og-data');
  if (inline) {
    document.querySelector('footer')?.remove();
    try {
      render(buildViewModel(JSON.parse(inline.textContent)), document.getElementById('app'), null);
    } catch (err) {
      document.getElementById('app').textContent = `failed to load bundle: ${err.message}`;
    }
  } else {
    const audio = document.querySelector('audio');
    fetch('/bundle.json')
      .then((r) => r.json())
      .then((bundle) => render(buildViewModel(bundle), document.getElementById('app'), audio))
      .catch((err) => { document.getElementById('app').textContent = `failed to load bundle: ${err.message}`; });
  }
}
