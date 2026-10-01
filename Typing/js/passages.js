/* ============================================================
   GODXSHADOW — passage library
   js/passages.js
   Every passage below is original text written for this project.
   Plain ASCII only, so nothing in the test can be mistyped by
   accident because of a smart quote or an em dash.
   ============================================================ */

window.GX_PASSAGES = (function () {

  const builtIn = [

    /* ---------- warm up ---------- */
    {
      id: 'warm-1', title: 'Slow Hands', category: 'warm up', difficulty: 'easy',
      text: 'Sit down. Put both hands on the home row. Find the small bumps under your index fingers and let them rest there. Do not look at the keys. Breathe out, then start. Slow is fine. Slow is how fast is built. Type each word once, cleanly, and only then move to the next one.'
    },
    {
      id: 'warm-2', title: 'Two Minute Calm', category: 'warm up', difficulty: 'easy',
      text: 'The room is quiet and the screen is bright. There is no clock you have to beat and no score you have to break. Type the way you would speak to a friend, at the pace you would walk on a warm evening. If a word goes wrong, fix it and keep going. Nothing here is counting against you yet.'
    },

    /* ---------- home row ---------- */
    {
      id: 'home-1', title: 'Home Row Ladder', category: 'home row', difficulty: 'easy',
      text: 'a s d f g h j k l a s d d k j f a s l k d f j g f d s a j k l a f d g h j k s l a d k j f g h a l s d k f j g a d s k l f j h g a s d l k j f'
    },
    {
      id: 'home-2', title: 'Home Row Words', category: 'home row', difficulty: 'easy',
      text: 'all fall ask had hall has jak lad ask sal flask gall had jak fall lad hall ask had sal flask gall all lad had ask hall jak fall gall flask sal had ask lad hall jak'
    },

    /* ---------- common words ---------- */
    {
      id: 'common-1', title: 'Everyday Two Hundred', category: 'common words', difficulty: 'easy',
      text: 'the of and to in is you that it he was for on are as with his they be at one have this from or had by word but not what all were when we there can an your which said if do will each about how up out them then she many some so these would other into has more her two like him see time could no make than first been its who now people my made over did down only way find use may water long little very after words called just where most know get through back much before go good new write our used me man too any day same right look think also around another came come work three must because does part even place well such here take why things help put years different away again off went old number great tell men say small every found still between name should home big give air line set own under read last never us left end along while might next sound below saw something thought both few those always look well ask went come made find here know back thing saw'
    },
    {
      id: 'common-2', title: 'Short Words, Fast Hands', category: 'common words', difficulty: 'easy',
      text: 'it is at of to in we do be on go so no he me my or an up as if by is it at we do be on go so no he me my or an up as if by it in of to is at we do be on go so no he me my or an up as if by it is at of to in'
    },

    /* ---------- rhythm ---------- */
    {
      id: 'rhythm-1', title: 'Bigram Machine', category: 'rhythm', difficulty: 'medium',
      text: 'th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ch ll be ma si om ur'
    },
    {
      id: 'rhythm-2', title: 'Even Beats', category: 'rhythm', difficulty: 'medium',
      text: 'type type type rest rest rest type type type rest rest rest. Steady beats build speed. Rushed beats build errors. Find the beat that lets you stay clean, then raise it by one small step. Do not raise it by five. Five is how a good run turns into a bad one halfway through.'
    },
    {
      id: 'rhythm-3', title: 'Alternating Hands', category: 'rhythm', difficulty: 'medium',
      text: 'dad sad lad had fall add all ask jak flask gall sal dad sad lad had fall add all ask jak flask gall sal dad sad lad had fall add all ask jak flask gall sal dad sad lad had fall add all ask jak'
    },

    /* ---------- punctuation & caps ---------- */
    {
      id: 'punct-1', title: 'Commas And Stops', category: 'punctuation', difficulty: 'medium',
      text: 'Speed is not a gift, it is a habit; and habits are boring on purpose. Practice a little every day, not a lot once a week. When the words blur, slow down. When the hands race ahead, breathe. Then, and only then, raise the pace again.'
    },
    {
      id: 'punct-2', title: 'Quotes Inside Quotes', category: 'punctuation', difficulty: 'medium',
      text: 'She said, "Type like the room is empty," and then added, "because it usually is." Nobody watches a typist at midnight. There is only the sound, the glow, and the slow climb of a number in the corner of the screen. That number does not care how you feel about it.'
    },
    {
      id: 'caps-1', title: 'Names And Titles', category: 'punctuation', difficulty: 'medium',
      text: 'Dr. Mehta opened the file, checked the Date, and wrote: "Send the Report to Room 4B before Noon." The Manager, Ms. Rao, had already left for Pune. Mr. Iyer, the Senior Clerk, promised to follow up on Monday, but Monday came and went, and the File stayed where it was.'
    },

    /* ---------- numbers & symbols ---------- */
    {
      id: 'num-1', title: 'Numbers Only', category: 'numbers', difficulty: 'medium',
      text: '4821 9037 1264 7758 3390 5512 8649 2073 6184 9925 1357 4468 7081 2946 5533 8210 6674 3391 9052 1487 5523 7764 2208 6631 4097 8845 1129 3376 9902 5548 7713 2264 6680 4417 8859 3302'
    },
    {
      id: 'num-2', title: 'Invoices And Dates', category: 'numbers', difficulty: 'medium',
      text: 'Invoice 20418 dated 14/03/2026 for 12,500.00 was paid on 02/04/2026. Item 7 costs 349.99 each, quantity 3, subtotal 1049.97, tax at 18 percent equals 188.99, total 1238.96. Reference number GST-9912-AB. Balance due: 0.00. Next review on 30/06/2026.'
    },
    {
      id: 'sym-1', title: 'Symbols Run', category: 'numbers', difficulty: 'hard',
      text: 'user@host:~/work $ git status -s && npm run build -- --prod | tee log.txt 2>&1 ; echo "exit=$?" ; [ -f dist/index.html ] && echo OK || echo MISSING ; export PORT=4173 ; curl -s localhost:$PORT | head -c 40'
    },

    /* ---------- code ---------- */
    {
      id: 'code-1', title: 'Function Shapes', category: 'code', difficulty: 'hard',
      text: 'const total = items.reduce((sum, item) => sum + item.price * item.qty, 0); if (total > limit) { throw new Error("over budget"); } return items.map(i => ({ id: i.id, label: i.name.trim(), cost: Number(i.price.toFixed(2)) }));'
    },
    {
      id: 'code-2', title: 'Async Flow', category: 'code', difficulty: 'hard',
      text: 'async function load(url, opts = {}) { const res = await fetch(url, { signal: opts.signal }); if (!res.ok) throw new Error(`bad status ${res.status}`); const data = await res.json(); return Array.isArray(data) ? data : [data]; }'
    },
    {
      id: 'code-3', title: 'Types And Interfaces', category: 'code', difficulty: 'hard',
      text: 'interface Run { id: string; wpm: number; acc: number; ts: Date; } type Mode = "time" | "words" | "passage"; function best(runs: Run[], mode: Mode): Run | null { return runs.filter(r => r.mode === mode).sort((a, b) => b.wpm - a.wpm)[0] ?? null; }'
    },

    /* ---------- technical prose ---------- */
    {
      id: 'tech-1', title: 'How The Timer Works', category: 'technical', difficulty: 'medium',
      text: 'The clock does not start when the page loads. It starts on your first keystroke, because that is the moment the run actually begins. Every second after that, the app takes a snapshot of how many correct characters you have produced and divides by five, which is the standard length of one word. That single division is the whole of the WPM number.'
    },
    {
      id: 'tech-2', title: 'Why Raw And Net Differ', category: 'technical', difficulty: 'medium',
      text: 'Raw speed counts every character you produced, including the wrong ones. Net speed counts only the correct ones. The distance between the two is the tax your mistakes charge you. A typist at ninety raw and seventy net is losing twenty words a minute to corrections, and fixing that is faster than learning to move quicker.'
    },
    {
      id: 'tech-3', title: 'What Consistency Measures', category: 'technical', difficulty: 'medium',
      text: 'Consistency is not accuracy. It asks a different question: was your pace even, or did it lurch? The app measures your speed once per second, then looks at how much those readings vary around their own average. A flat line scores near one hundred. A spiky line, with bursts and stalls, scores much lower even when the average is identical.'
    },
    {
      id: 'tech-4', title: 'Latency Notes', category: 'technical', difficulty: 'hard',
      text: 'Every request that crosses a network pays a round trip before a single byte of the response exists. That floor is set by distance and routing, not by how fast the server thinks. Caching moves the answer closer; compression makes the answer smaller; neither one shortens the road. When a page feels slow, measure the round trip before blaming the query.'
    },

    /* ---------- story ---------- */
    {
      id: 'story-1', title: 'The Last Train', category: 'story', difficulty: 'medium',
      text: 'The last train left at eleven and the platform was already empty. A single lamp buzzed above the bench where an old man sat with a paper bag and no ticket. The guard walked past twice, said nothing, and on the third pass stopped. "You missed it," he said. The man nodded. "I know. I come for the quiet."'
    },
    {
      id: 'story-2', title: 'Rain On The Tin Roof', category: 'story', difficulty: 'easy',
      text: 'It began as a whisper on the tin roof and grew into a drum. The children stopped their game and ran inside, laughing, shaking water from their hair. Their grandmother lit the lamp early and put the kettle on. Nobody said much. The rain said enough for everybody.'
    },
    {
      id: 'story-3', title: 'The Repair Shop', category: 'story', difficulty: 'medium',
      text: 'Forty years of radios sat on the shelves, none of them working, all of them waiting. A boy brought in a small grey set with a cracked dial and asked how long it would take. The old repairman turned it over in his hands, tapped the side, and smiled. "Ten minutes," he said, "and forty years of knowing where to tap."'
    },
    {
      id: 'story-4', title: 'Night Shift', category: 'story', difficulty: 'medium',
      text: 'Between two and four in the morning the city belongs to the people who keep it running. The baker, the nurse, the woman who cleans the office floors, the boy on the delivery bike. They never meet, yet they hand the day to one another in silence, each one finishing a shift so the next can start.'
    },

    /* ---------- hard ---------- */
    {
      id: 'hard-1', title: 'Rare Letters', category: 'hard', difficulty: 'hard',
      text: 'Zephyr quartz and sphynx glyphs, fjord waltz and jinxed pygmy crypts. The zyzyva buzzed by the fjord while a quixotic dwarf jinxed the sphinx. Sixty zephyrs whipped five dozen jackets, and every awkward buzzard quizzed the cryptic fjord dwarf with a jazzy, quixotic flourish.'
    },
    {
      id: 'hard-2', title: 'Long Words, No Mercy', category: 'hard', difficulty: 'hard',
      text: 'Synchronisation, authentication, and cryptographic infrastructure require simultaneous interpretation of extraordinarily complex representations. Bureaucratic miscommunication characterises most institutional misunderstandings; nevertheless, the responsibility remains unequivocally with the administrator who authorised the configuration.'
    },

    /* ---------- endurance ---------- */
    {
      id: 'end-1', title: 'The Long Run', category: 'endurance', difficulty: 'medium',
      text: 'Endurance is a different skill from speed. In a fifteen second test you can hold your breath and sprint, and the number will look better than it is. In a two minute test there is nowhere to hide. Your shoulders tighten, your breathing shallows, and the pace you set in the first ten seconds is the pace you will pay for in the last ten. The typists who score well on long runs are not the ones who start fastest. They are the ones who notice the drift early and correct it, one small adjustment at a time, without ever stopping. Watch your own curve as it draws. If it climbs and then sags, you started too hard. If it stays flat, you have found the rhythm that suits your hands, and that rhythm is worth more than any personal best you could grab by rushing the opening.'
    },
    {
      id: 'end-2', title: 'Marathon Paragraph', category: 'endurance', difficulty: 'medium',
      text: 'There is a particular kind of quiet that arrives when you have been typing for a while. The keys stop being separate events and become a single continuous sound, like rain on a window. You stop reading the words and start reading the shape of them, two or three ahead of your hands. This is the state everyone is actually chasing when they chase speed. It is not about moving your fingers faster than you can think. It is about thinking slightly ahead of your fingers, so that by the time they arrive at a word, the decision has already been made. Getting there takes longer than any single test. It takes weeks of boring, accurate, unhurried practice, and it takes the willingness to type slowly on the days when slow is all you have. But it stays with you once you have it. Years later, on a keyboard you have never touched, your hands will still find the rhythm, because the rhythm was never in the keyboard. It was in you.'
    },

    /* ---------- quotes ---------- */
    {
      id: 'quote-1', title: 'On Accuracy', category: 'quotes', difficulty: 'easy',
      text: 'Accuracy first, velocity second, ego last. A clean run at sixty beats a messy run at ninety every single time.'
    },
    {
      id: 'quote-2', title: 'On Patience', category: 'quotes', difficulty: 'easy',
      text: 'Muscle memory is just patience that never left the building. Small consistent runs build the hands that break records.'
    },
    {
      id: 'quote-3', title: 'On Focus', category: 'quotes', difficulty: 'easy',
      text: 'Do not chase the clock, chase the next correct character. When the words blur, slow down until they are sharp again.'
    },
    {
      id: 'quote-4', title: 'On Rhythm', category: 'quotes', difficulty: 'easy',
      text: 'Rhythm beats force, and breathing beats both. The fastest typist in the room is usually the calmest one.'
    }
  ];

  /* ---------- helpers ---------- */
  function wordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function categories() {
    const seen = [];
    builtIn.forEach(function (p) { if (seen.indexOf(p.category) < 0) seen.push(p.category); });
    return seen;
  }

  function byId(id) {
    for (let i = 0; i < builtIn.length; i++) if (builtIn[i].id === id) return builtIn[i];
    return null;
  }

  function decorated(list) {
    return list.map(function (p) {
      const wc = wordCount(p.text);
      return Object.assign({}, p, { words: wc, seconds: Math.round((wc / 60) * 60) });
    });
  }

  const decoratedAll = decorated(builtIn);

  return {
    builtIn: decoratedAll,
    categories: categories,
    categoryList: categories(),
    byId: function (id) { const p = byId(id); return p ? Object.assign({}, p, { words: wordCount(p.text) }) : null; },
    wordCount: wordCount
  };
})();
