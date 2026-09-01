// Wireframe screen 1, "ONBOARDING" — the swipeable intro carousel shown
// before SessionChoice (App.tsx's "onboarding" status, the very first thing
// a brand-new user sees). Not persisted anywhere: it shows once per app
// launch whenever config.name is still empty, same trigger SessionChoice
// already used before this screen existed — see App.tsx's load() effect.
//
// The wireframe has 5 frames on its swipe track: an unlabeled "welcome"
// title card, then four numbered content slides. Only 3 of those 4 made the
// cut here (decided with the user): slide 1 ("nutjob"), slide 3 ("a thread
// for every thought"), slide 4 ("your words stay yours"). Slide 2's
// "socratic dialogue" line got folded into slide 1's rewritten copy below,
// so slide 2 itself was dropped rather than kept as a near-duplicate.
//
// `index` is 0 for the welcome card, 1..PANEL_COUNT for the content slides
// that follow it — one flat number for "which of the N track frames is
// showing" rather than separate "on welcome?" / "which slide?" state, since
// the two would only ever need to agree with each other anyway.

import { useEffect, useRef, useState, type TouchEvent } from "react";

const PANEL_COUNT = 3;

// The Socratic-method definition shown in the small popover — wording the
// user supplied directly, not something this component or the wireframe
// invented. Deliberately not CBT/therapist-framed (an earlier draft was,
// see git history) since TalkCrates has no therapist in the loop — this is
// the general definition of the term itself.
const SOCRATIC_DEFINITION =
  'Socratic thinking, or the Socratic method, is a style of disciplined, cooperative questioning, asking "why" again and again to explore deep ideas, test beliefs and spark critical thinking.';

interface OnboardingProps {
  // Fires on "Skip", or on "Get Started" from the last content slide — both
  // mean the same thing to App.tsx (move on to SessionChoice), so this
  // component doesn't distinguish which one was pressed.
  onDone: () => void;
}

export function Onboarding({ onDone }: OnboardingProps) {
  const [index, setIndex] = useState(0);
  // Whether the "socratic thinking" definition popover is open. Lives here
  // rather than on the term itself since there's only ever one term to
  // define — no need for a set of open-term ids.
  const [showDefinition, setShowDefinition] = useState(false);
  const termRef = useRef<HTMLSpanElement>(null);
  // Not React state on purpose: touch position is read once, on the very
  // next touchend, and never rendered — a ref avoids a re-render for every
  // pixel of finger movement that setState would otherwise cause.
  const touchStartX = useRef<number | null>(null);

  const isLastPanel = index === PANEL_COUNT;

  function goTo(next: number) {
    setShowDefinition(false);
    setIndex(next);
  }

  function handleNext() {
    if (isLastPanel) {
      onDone();
    } else {
      goTo(index + 1);
    }
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  // Simple swipe: compare where the finger landed to where it started, no
  // live drag-follow of the track. Matches the wireframe's gesture (swipe
  // left/right moves one slide) without the extra bookkeeping a
  // finger-tracks-the-track version would need for not much visible
  // difference at this app's scale.
  function handleTouchEnd(e: TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;

    const SWIPE_THRESHOLD_PX = 40;
    const delta = e.changedTouches[0].clientX - startX;
    if (delta <= -SWIPE_THRESHOLD_PX && index < PANEL_COUNT) {
      goTo(index + 1);
    } else if (delta >= SWIPE_THRESHOLD_PX && index > 0) {
      goTo(index - 1);
    }
  }

  // Closes the definition popover on an outside click/tap or Escape, same
  // dismissal pattern as the app's other overlays (Settings, thread
  // dialogs) even though this one is a small inline popover rather than a
  // full-screen backdrop.
  useEffect(() => {
    if (!showDefinition) return;

    function handlePointerDown(e: PointerEvent) {
      if (!termRef.current?.contains(e.target as Node)) {
        setShowDefinition(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowDefinition(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDefinition]);

  return (
    <div className="onboarding">
      <div
        className="onboarding-track"
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="onboarding-panel"
          onClick={() => index === 0 && goTo(1)}
        >
          <h1>
            Welcome to
            <br />
            TalkCrates
          </h1>
          <div className="onboarding-hint">Swipe or tap to begin</div>
        </div>

        {/* Slide 1 ("nutjob") */}
        <div className="onboarding-panel">
          <h1>Talk to yourself (without feeling like a nutjob)</h1>
          <p>
            TalkCrates encourages you to turn your inner monologue into a
            real back and forth, encouraging{" "}
            <span ref={termRef} className="onboarding-term-wrap">
              <button
                type="button"
                className="onboarding-term"
                aria-expanded={showDefinition}
                onClick={() => setShowDefinition((v) => !v)}
              >
                socratic thinking
              </button>
              {showDefinition && (
                <span className="onboarding-tooltip" role="tooltip">
                  {SOCRATIC_DEFINITION}
                </span>
              )}
            </span>
            . This helps identify thought patterns, reason out those
            patterns and learn something about yourself you probably didn't
            know until you questioned yourself and introspected.
          </p>
        </div>

        {/* Slide 3 ("a thread for every thought") */}
        <div className="onboarding-panel">
          <h1>A thread for every thought</h1>
          <p>
            Keep separate conversations for separate decisions, worries, or
            things you just need to introspect about.
          </p>
        </div>

        {/* Slide 4 ("your words stay yours") — the wireframe's copy here
            promised a password protected export file, which CLAUDE.md later
            decided against (see "Zip password protection... deferred").
            Rewritten to describe what the app actually does instead: all
            storage and export/import happens client side, nothing is sent
            to a server. */}
        <div className="onboarding-panel">
          <h1>Your words stay yours</h1>
          <p>
            Everything is stored on your device. It's all client side, so
            nothing you write is ever sent to a server, and it's yours to
            export as a backup whenever you like.
          </p>
        </div>
      </div>

      {index > 0 && (
        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {Array.from({ length: PANEL_COUNT }).map((_, i) => (
              <span
                key={i}
                className={
                  "onboarding-dot" +
                  (i === index - 1 ? " onboarding-dot--active" : "")
                }
              />
            ))}
          </div>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-skip" onClick={onDone}>
              Skip
            </button>
            <button
              type="button"
              className="onboarding-next"
              onClick={handleNext}
            >
              {isLastPanel ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
