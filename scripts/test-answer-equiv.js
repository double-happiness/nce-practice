'use strict';
// 口语等价判分回归：node scripts/test-answer-equiv.js

const { isDialogueTurnCorrect } = require('../lib/dialogue-grade');

function assertMatch(label, turn, response, expected) {
  const got = isDialogueTurnCorrect(turn, response);
  if (got !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${got}`);
    process.exitCode = 1;
  } else {
    console.log(`ok ${label}`);
  }
}

const toGoTurn = { en: 'To go, thanks.' };

assertMatch('thanks vs thank you', toGoTurn, 'To go, thank you.', true);
assertMatch('exact answer', toGoTurn, 'To go, thanks.', true);
assertMatch('case and punctuation', toGoTurn, 'TO GO, THANKS!', true);
assertMatch('wrong meaning', toGoTurn, 'For here, thanks.', false);
assertMatch('missing please/thanks', toGoTurn, 'To go.', false);

const latteTurn = { en: "I'd like a grande latte, please." };
assertMatch('contraction expand', latteTurn, 'I would like a grande latte, please.', true);
assertMatch('contraction shrink', latteTurn, "I'd like a grande latte, please.", true);
assertMatch('want vs like', latteTurn, 'I want a grande latte, please.', true);

const welcomeTurn = { en: "You're welcome." };
assertMatch('you are welcome', welcomeTurn, 'You are welcome.', true);

const coffeeTurn = { en: 'Can I get a coffee?' };
assertMatch('could i have', coffeeTurn, 'Could I have a coffee?', true);
assertMatch('may i get', coffeeTurn, 'May I get a coffee?', true);
assertMatch('unrelated sentence', coffeeTurn, 'I want a coffee.', false);

const haveTurn = { en: 'Do you have oat milk?' };
assertMatch('have you got', haveTurn, 'Have you got oat milk?', true);

const aliasTurn = {
  en: 'Can I get a coffee?',
  aliases: ['Could I have a coffee?', 'May I have a coffee?'],
};
assertMatch('manual alias still works', aliasTurn, 'May I have a coffee?', true);

if (!process.exitCode) console.log('\nAll tests passed.');
