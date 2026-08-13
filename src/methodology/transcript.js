// Transcript parsing. Two accepted inputs, both producing the same canonical
// shape opengong-lite uses downstream: { segments: [{ id, speaker, role, text }] }.
//
// 1. Labeled text (one utterance per line — the demo/paste format):
//      Aakash (AE): We could roll out in two weeks.
//      Priya (VP Ops): What about HIPAA?
//    The "(Role)" part is optional; lines without a "Name:" prefix are
//    treated as continuations of the previous speaker.
//
// 2. Canonical JSON: { segments: [{ speaker, text, ... }] } — pass-through
//    with ids assigned if missing. This is the shape a Vexa transcript or the
//    parent repo's canonical transcript reduces to.

const SPEAKER_LINE = /^([^:()]{1,40}?)(?:\s*\(([^)]{1,60})\))?:\s*(.+)$/;

export function parseTranscript(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return fromJson(JSON.parse(trimmed));
  }
  return fromLabeledText(trimmed);
}

function fromJson(data) {
  const list = Array.isArray(data) ? data : data.segments;
  if (!Array.isArray(list)) throw new Error('TRANSCRIPT_BAD_JSON: expected {segments: [...]} or an array');
  return {
    segments: list.map((s, i) => ({
      id: s.id ?? i,
      speaker: s.speaker ?? `speaker_${(i % 2) + 1}`,
      role: s.role ?? null,
      text: String(s.text ?? '').trim(),
    })).filter((s) => s.text.length > 0),
  };
}

function fromLabeledText(text) {
  const segments = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue; // headers/comments
    const m = t.match(SPEAKER_LINE);
    if (m) {
      segments.push({ id: segments.length, speaker: m[1].trim(), role: m[2]?.trim() ?? null, text: m[3].trim() });
    } else if (segments.length > 0) {
      segments[segments.length - 1].text += ` ${t}`;
    }
    // A leading unlabeled line with no prior speaker is dropped — the CLI
    // warns when nothing parsed at all.
  }
  return { segments };
}

export function speakerLabelsFound(transcript) {
  return transcript.segments.length > 0
    && new Set(transcript.segments.map((s) => s.speaker)).size >= 2;
}

// Render for the prompt: numbered, one utterance per line. Segment ordinals
// are what the model cites; the gate verifies quotes against these exact lines.
export function renderForPrompt(transcript) {
  return transcript.segments
    .map((s) => `[${s.id}] ${s.speaker}${s.role ? ` (${s.role})` : ''}: ${s.text}`)
    .join('\n');
}
