# Sybill product UI reference (Sourav's account, screenshot 2026-08-14)

Source: live screenshot of Sybill's AI Workflows page from Sourav's logged-in account.
This is the dashboard pattern we want, translated to our flows. It also handed us a
first-party differentiation exhibit (see the banner note at the bottom).

## What their IA does well (the pattern to keep)

1. **Entity-first left nav.** Meetings, Deals, Companies, Tasks. The user picks the
   noun they care about; features live inside nouns. No feature-first clutter.
2. **Outputs as customization cards.** Each artifact the product makes (Pre-meeting
   Brief, Meeting Summary, Deal Summary, Deal Autofill) is a card with one action:
   Customize. Configuration feels like editing a document type, never like settings.
3. **Template Library as a first-class surface.** "40+ templates" badge, one-click
   activate, browse-all. The library is merchandised, never buried in settings.
4. **Automated Prompts.** User-authored prompts that run on a schedule or event
   trigger. Their version of a recurring loop, exposed as a product surface.
5. **Getting-started checklist** pinned bottom-left with a progress bar. Four verbs:
   prep, ask, write a follow-up, autofill. Onboarding by doing the actual four jobs.

## Translated to our flows (the build target)

Left nav, ours:

| Theirs | Ours | Notes |
|---|---|---|
| Meetings | Calls | per-call notes with citations |
| Deals | Deals | THE primary noun; deal workspace is home (already true at :4318) |
| Companies | Accounts | rollup later; contact-level vs deal-level notes split |
| Tasks | Commitments | the ledger IS our task list: promised, owed, kept |
| Statistics | Scorecards | rep coaching on the manager's methodology |
| AI Workflows | Workshop | templates + extractors + methodology packs, all files |
| Ask Sybill | (roadmap) | deal Q&A over gated claims only |

Output cards, ours (each maps to a file the user can already edit):

- **Call notes** → extractor set (extractors/*.json). Customize = pick families.
- **Deal summary** → rollup config. Customize = which sections roll up per stage.
- **Coaching scorecard** → methodology pack (methodologies/*.json). Customize = pick
  or compile the pack. Theirs is pro-gated; ours is free. Say so on the card.
- **Follow-up email** → template set (Aakash's lane, research/13 05). Customize =
  edit template blocks. Routing is automatic on the detected outcome; their rep
  picks from a dropdown.
- **Deal autofill (CRM)** → crm_map preview card, approval-gated, roadmap. Theirs
  is pro-gated and capped at 10 fields; note that on the card when it lands.

Our structural advantages to keep visible in this IA: every card's output carries
citations; every config is a versioned file (exportable, diffable, PR-able); nothing
is tier-gated.

## The banner (differentiation exhibit, first-party)

The screenshot's top banner, red, on a real account: "Usage Limits Important!
Meetings recorded over 3 months ago are scheduled to be deleted. Upgrade now to
prevent your data from being erased."

That is the incumbent posture in one sentence: your call recordings are leverage.
Ours: self-hosted, bulk-exportable, MIT. Nobody schedules your deals for deletion.
Use sparingly and factually; the screenshot is the receipt. Do not name the account
in public materials.

## Build sequencing

The dashboard IA is post-hackathon (Show HN week at earliest). Nothing here blocks
Friday. It belongs to the entry repo (Next.js) as the shell around the existing run
workspace, with the engine repo staying headless underneath. Filed to issue #2 so
Aakash's features land inside this IA rather than as bolt-on pages.
