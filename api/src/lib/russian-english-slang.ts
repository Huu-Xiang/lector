type Sense = { partOfSpeech: 'noun' | 'adjective'; gloss: string };

// Short Russian definitions checked against Cambridge, Oxford and Doctorow's
// account of platform decay. Keep these ahead of shared model-generated glosses.
const entries = new Map<string, Sense[]>([
  [
    'doomscrolling',
    [{ partOfSpeech: 'noun', gloss: 'навязчивое пролистывание ленты с плохими новостями' }],
  ],
  [
    'ragebait',
    [{ partOfSpeech: 'noun', gloss: 'контент, который намеренно вызывает гнев ради реакций' }],
  ],
  [
    'brainrot',
    [
      { partOfSpeech: 'noun', gloss: 'бессмысленный, отупляющий интернет-контент' },
      { partOfSpeech: 'noun', gloss: 'ощущение умственного притупления от такого контента' },
    ],
  ],
  ['delulu', [{ partOfSpeech: 'adjective', gloss: 'верящий в собственные фантазии (шутл.)' }]],
  [
    'enshittification',
    [{ partOfSpeech: 'noun', gloss: 'постепенное ухудшение онлайн-сервиса ради прибыли' }],
  ],
]);

export function russianEnglishSlang(word: string): Sense[] | undefined {
  const key = word.trim().toLowerCase();
  return entries.get(key === 'rage-bait' ? 'ragebait' : key === 'brain-rot' ? 'brainrot' : key);
}
