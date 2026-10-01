/* ============================================================
   GODXSHADOW — typing engine
   js/engine.js   (no DOM logic here — pure measurement)
   ============================================================ */

window.GX_Engine = (function () {

  function Stats() {
    this.startTime = null;
    this.endTime = null;
    this.samples = [];        // {t, wpm, raw, acc}
    this.history = [];        // per word: {typed, correct}
    this.correctChars = 0;
    this.incorrectChars = 0;
    this.extraChars = 0;
    this.missedChars = 0;
    this.correctedCount = 0;
    this.keystrokes = 0;
    this.totalKeystrokes = 0; // includes corrections
    this.backspaces = 0;
    this.currentWordStart = 0;
    this.wordsTyped = 0;
    this.finished = false;
  }

  Stats.prototype.start = function (now) {
    this.startTime = now;
    this.currentWordStart = now;
    this.samples = [];
    this._last = { correct: 0, incorrect: 0, extra: 0, t: 0 };
  };

  Stats.prototype.elapsedMs = function (now) {
    if (this.startTime === null) return 0;                 // never started
    const end = this.endTime === null ? now : this.endTime; // running → live clock
    return Math.max(0, end - this.startTime);
  };

  Stats.prototype.elapsedSec = function (now) {
    return this.elapsedMs(now) / 1000;
  };

  /**
   * Record one character judgement.
   * kind: 'correct' | 'incorrect' | 'extra' | 'missed'
   */
  Stats.prototype.record = function (kind, now) {
    this.totalKeystrokes++;
    if (kind === 'correct') this.correctChars++;
    else if (kind === 'incorrect') this.incorrectChars++;
    else if (kind === 'extra') this.extraChars++;
    else if (kind === 'missed') this.missedChars++;
  };

  Stats.prototype.noteCorrection = function () {
    this.correctedCount++;
    this.totalKeystrokes++;
  };

  Stats.prototype.noteBackspace = function () {
    this.backspaces++;
    this.totalKeystrokes++;
  };

  /** Push a completed word into history (typed = what user submitted). */
  Stats.prototype.pushWord = function (typed, expected, now) {
    let correct = 0;
    const n = Math.min(typed.length, expected.length);
    for (let i = 0; i < n; i++) if (typed[i] === expected[i]) correct++;
    this.history.push({ typed: typed, expected: expected, correct: correct });
    this.wordsTyped++;
    this.currentWordStart = now;
  };

  /** Characters counted for WPM = correct chars only. */
  Stats.prototype.wpm = function (now) {
    const sec = this.elapsedSec(now);
    if (sec <= 0) return 0;
    return (this.correctChars / 5) / (sec / 60);
  };

  /** Raw WPM counts every character the user produced, right or wrong. */
  Stats.prototype.rawWpm = function (now) {
    const sec = this.elapsedSec(now);
    if (sec <= 0) return 0;
    const all = this.correctChars + this.incorrectChars + this.extraChars;
    return (all / 5) / (sec / 60);
  };

  Stats.prototype.accuracy = function () {
    const total = this.correctChars + this.incorrectChars + this.extraChars;
    if (!total) return 100;
    return (this.correctChars / total) * 100;
  };

  /**
   * Consistency = inverse coefficient of variation across 1-second WPM samples.
   * 100 = perfectly even pace.
   */
  Stats.prototype.consistency = function () {
    const vals = this.samples.map(function (s) { return s.wpm; }).filter(function (v) { return v > 0; });
    if (vals.length < 2) return 100;
    const mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    if (mean === 0) return 0;
    const variance = vals.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / vals.length;
    const cv = Math.sqrt(variance) / mean;
    return Math.max(0, (1 - cv) * 100);
  };

  /**
   * Take a 1-second sample (called from the ticker).
   * The WPM values here are INSTANT — measured over the interval since the
   * previous sample — otherwise a cumulative average flattens out and the
   * consistency metric becomes meaningless.
   */
  Stats.prototype.sample = function (now) {
    const t = Math.round(this.elapsedSec(now));
    const L = this._last;
    const dt = Math.max(1, t - L.t);           // seconds in this interval
    const dCorrect = this.correctChars - L.correct;
    const dIncorrect = this.incorrectChars - L.incorrect;
    const dExtra = this.extraChars - L.extra;

    const instWpm = (dCorrect / 5) / (dt / 60);
    const instRaw = ((dCorrect + dIncorrect + dExtra) / 5) / (dt / 60);
    const dTotal = dCorrect + dIncorrect + dExtra;
    const instAcc = dTotal ? (dCorrect / dTotal) * 100 : 100;

    this.samples.push({
      t: t,
      wpm: instWpm,
      raw: instRaw,
      acc: instAcc,
      cumWpm: this.wpm(now),
      cumAcc: this.accuracy()
    });

    L.correct = this.correctChars;
    L.incorrect = this.incorrectChars;
    L.extra = this.extraChars;
    L.t = t;
  };

  Stats.prototype.finish = function (now) {
    this.endTime = now;
    this.finished = true;
    this.sample(now);
  };

  Stats.prototype.summary = function (now) {
    const sec = this.elapsedSec(now);
    return {
      wpm: this.wpm(now),
      raw: this.rawWpm(now),
      accuracy: this.accuracy(),
      consistency: this.consistency(),
      seconds: sec,
      correctChars: this.correctChars,
      incorrectChars: this.incorrectChars,
      extraChars: this.extraChars,
      missedChars: this.missedChars,
      words: this.wordsTyped,
      keystrokes: this.correctChars + this.incorrectChars + this.extraChars,
      totalKeystrokes: this.totalKeystrokes,
      corrections: this.correctedCount,
      backspaces: this.backspaces,
      samples: this.samples.slice()
    };
  };

  return { Stats: Stats };
})();
