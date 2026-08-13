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

export function buildViewModel(bundle) {
  const claims = bundle.claims.map((claim) => {
    const primary = claim.evidence?.[0] ?? null;
    const anchored = claim.status === 'verified' || claim.status === 'segment_corrected';
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

  return {
    title: bundle.call?.title ?? bundle.call?.id ?? 'call',
    coverage: bundle.notes.coverage,          // rendered verbatim, never recomputed
    utterances: bundle.transcript.utterances,
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
      <h1>${escapeHtml(vm.title)}</h1>
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
          <div class="utt" data-utt="${u.id}">
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
      const utt = root.querySelector(`.utt[data-utt="${claim.anchor.utterance_id}"]`);
      if (!utt) return;
      utt.classList.add('active');
      const txt = utt.querySelector('.txt');
      const raw = vm.utterances[claim.anchor.utterance_id].text;
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

// Boot only in a browser; node imports the pure helpers above.
if (typeof document !== 'undefined') {
  const audio = document.querySelector('audio');
  fetch('/bundle.json')
    .then((r) => r.json())
    .then((bundle) => render(buildViewModel(bundle), document.getElementById('app'), audio))
    .catch((err) => { document.getElementById('app').textContent = `failed to load bundle: ${err.message}`; });
}
