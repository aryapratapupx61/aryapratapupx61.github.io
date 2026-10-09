/* ============================================================
   GODXSHADOW — hero auto-typing tagline
   js/hero.js

   Types each line, holds it, erases it, then moves to the next.
   After the last line it loops back to the first, forever.

   The loop is a small state machine driven by setTimeout, and
   GX_Hero.step() advances it one event at a time so the whole
   cycle can be tested deterministically.
   ============================================================ */

window.GX_Hero = (function () {

  const LINES = [
    'Real-time WPM, raw speed, accuracy and consistency — plotted live as you type.',
    'No account, no upload.',
    'Everything runs in your browser.'
  ];

  const SPEED = { type: 34, erase: 18, hold: 1500, gap: 380 };

  let out = null;
  let li = 0;          // which line
  let ci = 0;          // characters currently shown
  let phase = 'type';  // type | hold | erase | gap
  let timer = null;
  let running = false;

  function render() {
    if (out) out.textContent = LINES[li].slice(0, ci);
  }

  /** One transition of the state machine. Returns the new phase. */
  function step() {
    const line = LINES[li];

    if (phase === 'type') {
      if (ci < line.length) { ci++; render(); schedule(SPEED.type); return phase; }
      phase = 'hold';
      schedule(SPEED.hold);
      return phase;
    }

    if (phase === 'hold') {
      phase = 'erase';
      schedule(SPEED.erase);
      return phase;
    }

    if (phase === 'erase') {
      if (ci > 0) { ci--; render(); schedule(SPEED.erase); return phase; }
      phase = 'gap';
      schedule(SPEED.gap);
      return phase;
    }

    // gap -> next line, wrapping back to the first after the last
    li = (li + 1) % LINES.length;
    ci = 0;
    phase = 'type';
    render();
    schedule(SPEED.type);
    return phase;
  }

  function schedule(ms) {
    if (!running) return;
    clearTimeout(timer);
    timer = setTimeout(step, ms);
  }

  function start() {
    out = document.getElementById('heroText');
    if (!out) return;

    // respect the OS "reduce motion" setting: show one line, no animation
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mq && mq.matches) {
      out.textContent = LINES[0];
      return;
    }

    li = 0; ci = 0; phase = 'type';
    running = true;
    render();
    schedule(SPEED.type);
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
  }

  document.addEventListener('DOMContentLoaded', start);

  return {
    LINES: LINES,
    step: step,
    start: start,
    stop: stop,
    /** where the machine is right now (used by the tests) */
    state: function () { return { line: li, chars: ci, phase: phase, text: LINES[li].slice(0, ci) }; }
  };
})();
