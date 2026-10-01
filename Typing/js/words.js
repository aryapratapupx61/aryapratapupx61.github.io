/* ============================================================
   GODXSHADOW — word banks (all original content)
   js/words.js
   ============================================================ */

window.GX_WORDS = (function () {
  // 200 most common English words
  const top200 = `the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us man find here thing tell very great those woman through life child there after should world over school still try last ask need feel three when state never between high really something most another much family own under leave point old course place number part small found great while along might close something seem next hard open example begin head story since page far run move like little every good group under again those work young start may`.split(/\s+/);

  // 500 common words (extended, original list)
  const top500 = top200.concat(`
able across add against age ago air allow almost already also always among amount another answer appear area around art ask away baby back bad bag bank base be bear beat become bed been before began begin behind being believe belong best better big bill black blue board boat body book born both bottom box boy break bring build business buy call came case catch cause center certain change check child city class clear close cold college come common company complete computer consider control copy cost country court cover cross cry culture cup current cut dark data deal death decide deep degree develop did die different difficult direct does dog door down draw drive drop dry during each early earth east easy eat edge effect either else end enough enter equal especially even evening event ever every exact except expect explain eye face fact fail fair fall far farm fast father fear feel few field fight figure fill final fire five fix floor fly follow food foot force form found four free friend front full fun future game garden gas general get girl give glad glass gold gone got government grade grand great green ground group grow guess hair half hand happen happy hard has have head hear heart heat heavy held help her here high him himself his hold home hope hour house how however human hundred idea important improve include increase indeed interest into is island it job join just keep kept key kill kind knew know known land language large last late later laugh law lay lead learn least leave led left leg less let letter level lie life light line list listen little live long look lose loss lot love low main major make man many mark market matter may maybe me mean measure meet men method might mile mind mine minute miss model modern moment money month more morning most mother move much music must my name nation near necessary need never new next night nine no none nor north not note nothing notice now number of off often oh oil old on once one only open or order other our out over own page paper part party pass past pay people per perform person phone piece place plan plant play please point police policy poor position possible post pound power practice prepare present press pretty prevent price print problem produce program promise provide public pull purpose push put quality question quick quiet quite race radio raise rather reach read ready real really reason receive record red remember report rest result return rich ride right rise road rock role room round rule run safe same sat save saw say school science score sea second secret see seem seen self sell send sense sent separate series serious serve service set seven several shall shape share sharp she sheet ship short shot should show side sight sign simple since single sir sister sit six size skill sleep small smile snow so social soft some son song soon sort sound south space speak special speed spend sport spring square staff stage stand start state stay step still stop store story street strong study student such sudden summer sun support sure surface system table take talk tall teach team tell ten test than thank that the their them then there these they thing think third this those though thought thousand three through throw thus time tiny to today together told too took top total touch toward town trade travel tree trial true try turn two type under understand until up upon us use used usual value various very view village voice wait walk wall want war warm was watch water wave way we wear weather week weight welcome well went were what wheel when where whether which while white who whole whom whose why wide wife wild will win wind window wing winter wire wish with within without woman wonder wood word work world would write written wrong yard yeah year yellow yes yet you young your`
    .split(/\s+/).filter(Boolean));

  // programming vocabulary
  const code = `const let function return async await import export class extends implements interface type enum struct interface void null undefined true false if else switch case break continue for while do try catch finally throw new delete typeof instanceof this super static public private protected readonly get set yield default export module require package dependency callback promise resolve reject then catch finally async sync thread mutex lock queue stack heap tree graph node edge leaf root parent child sibling index array list map set tuple object string number boolean float integer byte char string buffer stream socket server client request response header body json xml yaml token session cookie cache redis query table row column join select where insert update delete create alter drop index primary foreign key unique check constraint transaction commit rollback deploy build compile lint test debug profile trace log warn error info level stack frame pointer reference value copy clone merge split filter reduce sort push pop shift unshift concat slice splice apply call bind scope closure hoist prototype chain event listener emit dispatch subscribe publish topic channel router middleware handler controller service repository model schema migration seed fixture mock stub spy sandbox runtime context global window document element node text class style attribute prop state effect render mount update unmount commit diff patch hydrate server render static dynamic bundle chunk module loader polyfill shim transpile minify uglify bundle tree shake lazy chunk prefetch preload font icon svg canvas webgl shader gpu cpu ram disk latency throughput bandwidth payload checksum hash cipher encrypt decrypt sign verify token jwt oauth saml sso rbac acl permission role user admin guest tenant workspace project repo branch merge rebase cherry pick commit push pull fetch clone fork issue label milestone release tag version semver lockfile registry publish install remove update audit vulnerability patch security auth login logout signup reset password email phone otp code verify confirm`.split(/\s+/);

  // quotes — original sentences written for this project
  const quotes = [
    "Speed is a habit, and every habit is built one clean keystroke at a time.",
    "The keyboard does not reward fast fingers, it rewards calm ones.",
    "Type like the screen is listening, because eventually it will be.",
    "Accuracy first, velocity second, ego last.",
    "Every error you correct today is a millisecond you save tomorrow.",
    "Neon lights the room, but focus is what lights the screen.",
    "Your hands already know the way, your eyes are just catching up.",
    "Do not chase the clock, chase the next correct character.",
    "A clean run at sixty beats a messy run at ninety every single time.",
    "Shadows move quietly, and so should your keystrokes.",
    "Practice until the keyboard feels like an extension of the thought.",
    "The fastest typist in the room is usually the calmest one.",
    "Muscle memory is just patience that never left the building.",
    "Rhythm beats force, and breathing beats both.",
    "When the words blur, slow down until they are sharp again.",
    "You are not typing words, you are drawing them at speed.",
    "Silence the noise, keep the glow, and let the fingers run.",
    "Small consistent runs build the hands that break records."
  ];

  const easy = `cat dog run sun red big top fun pen map bus cup hat box leg net pot six ten one two arm eye leg ear cow fox owl bee ant bug hen pig fox toy key pen ink log mud pot rug van web zoo zip`.split(/\s+/);

  const numbers = (() => {
    const out = [];
    for (let i = 0; i < 220; i++) out.push(String(Math.floor(Math.random() * 9000) + 10));
    return out;
  })();

  const codeSymbols = `const x = 1; let y = 2; if (a > b) { c = a - b; } for (let i = 0; i < n; i++) { sum += arr[i]; } return obj.key ?? 'none'; const fn = (a, b) => a * b; map<string, number> = {}; class Node<T> { next: T | null; } await fetch(url).then(r => r.json()); while (i-- > 0) { buf[i] = 0xff; } try { parse(); } catch (e) { log(e); } a !== b ? a : b; (x & 0x0f) | (y << 4); arr.filter(v => v % 2 === 0);`
    .split(/\s+/);

  // difficulty filter used for the "hard" preset
  const hardWords = `rhythm lynx sphinx crypt glyph zyzyva quixotic fjord waltz nymph vortex jinx pygmy dwarf quartz jawbox khwaja zephyr oxygen gypsy dizzy fuzzy jazzy whiskey bewitch complexity phenomenon infrastructure synchronization authentication cryptography architecture reconnaissance bureaucracy entrepreneur simultaneously characteristic extraordinary responsibility misunderstanding communication interpretation representation constitution infrastructure`.split(/\s+/);

  // deterministic pseudo-random generator so a text can be replayed from a seed
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pick(source, count, seed) {
    const rnd = rng(seed);
    const pool = shuffle(source, rnd);
    const out = [];
    for (let i = 0; i < count; i++) out.push(pool[i % pool.length]);
    return out.join(' ');
  }

  /**
   * HCM — "Hardcore Mix": everything at once. Sentences end with a full
   * stop every few words, the word after every break starts with a capital,
   * and numbers are scattered through the flow.
   */
  function generateHcm(count, seed) {
    const rnd = rng(seed);
    const out = [];
    let sentenceLen = 0;
    for (let i = 0; i < count; i++) {
      const prev = out.length ? out[out.length - 1] : '';
      // a sentence always opens on a capital word, never on a number
      const afterBreak = i === 0 || prev.charAt(prev.length - 1) === '.';
      const isNumber = !afterBreak && rnd() < 0.15;
      let token = isNumber
        ? String(Math.floor(rnd() * 9000) + 10)
        : top500[Math.floor(rnd() * top500.length)];
      if (afterBreak) token = token.charAt(0).toUpperCase() + token.slice(1);
      // end the sentence after 3-9 words, never on a number
      sentenceLen++;
      if (!isNumber && i < count - 1 && sentenceLen >= 3 && rnd() < 0.22) {
        token += '.';
        sentenceLen = 0;
      }
      out.push(token);
    }
    return out.join(' ');
  }

  /**
   * Generate a test text.
   * @param {'words10'|'words25'|'words50'|'words100'|'time15'|'time30'|'time60'|'time120'} mode
   * @param {number} seed
   * @param {{list?:string, codeMode?:boolean, numbers?:boolean, punctuation?:boolean, caps?:boolean}} opts
   */
  function generate(mode, seed, opts) {
    opts = opts || {};
    const listName = opts.list || 'top200';
    const lists = { top200, top500, code, quotes, easy, numbers, codeSymbols };
    let base = (lists[listName] || top200).slice();
    if (opts.numbers && listName !== 'numbers') base = base.concat(numbers.slice(0, 60));
    if (opts.codeMode && listName !== 'codeSymbols') base = base.concat(codeSymbols);

    let count = 100;
    if (mode === 'words10') count = 10;
    else if (mode === 'words25') count = 25;
    else if (mode === 'words50') count = 50;
    else if (mode === 'words100') count = 100;
    else if (mode === 'time15') count = 60;
    else if (mode === 'time30') count = 90;
    else if (mode === 'time60') count = 160;
    else if (mode === 'time120') count = 260;

    // HCM is self-contained: capitals after breaks + numbers, always on
    if (listName === 'hcm') return generateHcm(count, seed);

    const hardMix = opts.difficulty === 'hard';
    if (hardMix) base = base.concat(hardWords, hardWords, hardWords);

    let text = pick(base, count, seed);

    if (opts.punctuation) {
      // roughly one in seven word gaps gets a comma or semicolon
      text = text.replace(/\s+/g, function (m, offset) {
        const r = rng(seed + offset * 7919)();
        if (r > 0.90) return ', ';
        if (r > 0.855) return '; ';
        return ' ';
      });
      if (rng(seed + 7)() > 0.4) text += '.';
    }
    if (opts.caps) {
      text = text.split(' ').map(function (w, i) {
        return (i === 0 || rng(seed + i)() > 0.86) && /[a-z]/.test(w)
          ? w.charAt(0).toUpperCase() + w.slice(1)
          : w;
      }).join(' ');
    }
    return text;
  }

  return {
    top200, top500, code, quotes, easy, numbers, codeSymbols, hardWords,
    lists: { top200, top500, code, quotes, easy, numbers },
    generate, rng
  };
})();
