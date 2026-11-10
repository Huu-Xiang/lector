import { PHRASE_SPANS, PHRASE_TEXTS, type PhraseTexts } from './demo-phrases';

export type DemoSetId = 'zh' | 'ja' | 'ko' | 'ru' | 'es' | 'fr' | 'en';
export type LearnLang = 'en' | 'fr';
export type Pos =
  | 'adj'
  | 'noun'
  | 'propn'
  | 'verb'
  | 'pron'
  | 'det'
  | 'art'
  | 'prep'
  | 'conj'
  | 'adv';
export type NoteKind = 'usage' | 'idiom';

interface LexiconEntry {
  ipa: string;
  pos: Pos;
}

export interface DemoSentence {
  lang: LearnLang;
  tokens: readonly string[];
  /** Index in `tokens` of the word that carries the context note. */
  demoIndex: number;
}

interface SetSentence {
  translation: string;
  note: { kind: NoteKind; text: string };
  context: string;
}

export interface DemoSet {
  id: DemoSetId;
  learn: LearnLang;
  /** BCP 47 tag of the glosses, notes and translations. */
  meaningLang: string;
  pos: Record<Pos, string>;
  /** Meaning of each lexicon key, written in `meaningLang`. */
  glosses: Record<string, string>;
  sentences: readonly [SetSentence, SetSentence];
  /** Translation of each phrase of `PHRASE_SPANS`, in `meaningLang`. */
  phrases: PhraseTexts;
}

export interface WordEntry {
  head: string;
  ipa: string;
  pos: string;
  meaning: string;
}

export const SENTENCES: Record<LearnLang, readonly [DemoSentence, DemoSentence]> = {
  en: [
    {
      lang: 'en',
      tokens: ['She', 'was', 'tired', ',', 'so', 'she', 'went', 'to', 'bed', 'early', '.'],
      demoIndex: 2,
    },
    {
      lang: 'en',
      tokens: [
        'Alice',
        'was',
        'beginning',
        'to',
        'get',
        'very',
        'tired',
        'of',
        'sitting',
        'by',
        'her',
        'sister',
        'on',
        'the',
        'bank',
        '.',
      ],
      demoIndex: 14,
    },
  ],
  fr: [
    {
      lang: 'fr',
      tokens: ['Elle', 'était', 'fatiguée', ',', 'alors', 'elle', "s'est", 'couchée', 'tôt', '.'],
      demoIndex: 2,
    },
    {
      lang: 'fr',
      tokens: [
        'Marie',
        'commençait',
        'à',
        'se',
        'lasser',
        "d'attendre",
        'son',
        'frère',
        'sur',
        'le',
        'quai',
        '.',
      ],
      demoIndex: 10,
    },
  ],
};

const LEXICON: Record<LearnLang, Record<string, LexiconEntry>> = {
  en: {
    she: { ipa: '/ʃiː/', pos: 'pron' },
    was: { ipa: '/wɒz/', pos: 'verb' },
    tired: { ipa: '/ˈtaɪəd/', pos: 'adj' },
    so: { ipa: '/səʊ/', pos: 'conj' },
    went: { ipa: '/went/', pos: 'verb' },
    to: { ipa: '/tuː/', pos: 'prep' },
    bed: { ipa: '/bed/', pos: 'noun' },
    early: { ipa: '/ˈɜːli/', pos: 'adv' },
    alice: { ipa: '/ˈælɪs/', pos: 'propn' },
    beginning: { ipa: '/bɪˈɡɪnɪŋ/', pos: 'verb' },
    get: { ipa: '/ɡet/', pos: 'verb' },
    very: { ipa: '/ˈveri/', pos: 'adv' },
    of: { ipa: '/ɒv/', pos: 'prep' },
    sitting: { ipa: '/ˈsɪtɪŋ/', pos: 'verb' },
    by: { ipa: '/baɪ/', pos: 'prep' },
    her: { ipa: '/hɜː/', pos: 'det' },
    sister: { ipa: '/ˈsɪstə/', pos: 'noun' },
    on: { ipa: '/ɒn/', pos: 'prep' },
    the: { ipa: '/ðə/', pos: 'art' },
    bank: { ipa: '/bæŋk/', pos: 'noun' },
  },
  fr: {
    elle: { ipa: '/ɛl/', pos: 'pron' },
    était: { ipa: '/e.tɛ/', pos: 'verb' },
    fatiguée: { ipa: '/fa.ti.ɡe/', pos: 'adj' },
    alors: { ipa: '/a.lɔʁ/', pos: 'adv' },
    "s'est": { ipa: '/sɛ/', pos: 'verb' },
    couchée: { ipa: '/ku.ʃe/', pos: 'verb' },
    tôt: { ipa: '/to/', pos: 'adv' },
    marie: { ipa: '/ma.ʁi/', pos: 'propn' },
    commençait: { ipa: '/kɔ.mɑ̃.sɛ/', pos: 'verb' },
    à: { ipa: '/a/', pos: 'prep' },
    se: { ipa: '/sə/', pos: 'pron' },
    lasser: { ipa: '/la.se/', pos: 'verb' },
    "d'attendre": { ipa: '/da.tɑ̃dʁ/', pos: 'verb' },
    son: { ipa: '/sɔ̃/', pos: 'det' },
    frère: { ipa: '/fʁɛʁ/', pos: 'noun' },
    sur: { ipa: '/syʁ/', pos: 'prep' },
    le: { ipa: '/lə/', pos: 'art' },
    quai: { ipa: '/kɛ/', pos: 'noun' },
  },
};

export const DEMO_SETS: Record<DemoSetId, DemoSet> = {
  zh: {
    id: 'zh',
    learn: 'en',
    meaningLang: 'zh-CN',
    pos: {
      adj: '形容词',
      noun: '名词',
      propn: '专有名词',
      verb: '动词',
      pron: '代词',
      det: '限定词',
      art: '冠词',
      prep: '介词',
      conj: '连词',
      adv: '副词',
    },
    glosses: {
      she: '她',
      was: '是；在（be 的过去式）',
      tired: '① 累的，疲倦的 ② 厌倦的',
      so: '① 所以，因此 ② 这么，那么',
      went: '去（go 的过去式）',
      to: '① 到，向 ② 放在动词前，如 to get',
      bed: '床',
      early: '早，提早',
      alice: '爱丽丝（人名）',
      beginning: '开始（begin 的 -ing 形式）',
      get: '① 得到 ② 变得',
      very: '很，非常',
      of: '……的；tired of 里表示“厌烦”',
      sitting: '坐着（sit 的 -ing 形式）',
      by: '在……旁边',
      her: '她的',
      sister: '姐姐，妹妹',
      on: '在……上',
      the: '这个，那个（特指）',
      bank: '① 银行 ② 河岸，堤',
    },
    sentences: [
      {
        translation: '她累了，所以早早上床睡觉了。',
        note: { kind: 'usage', text: 'so 引出结果；go to bed 表示“上床睡觉”，bed 前不加 the。' },
        context: '这里指身体累了、想睡觉，不是“厌倦”。',
      },
      {
        translation: '爱丽丝坐在河岸上，挨着姐姐，渐渐觉得很厌烦了。',
        note: { kind: 'idiom', text: 'get tired of doing：对做某事感到厌烦，不是身体累。' },
        context: 'on the bank 在这里是“在河岸上”，不是“银行”。',
      },
    ],
    phrases: PHRASE_TEXTS.zh,
  },
  ja: {
    id: 'ja',
    learn: 'en',
    meaningLang: 'ja',
    pos: {
      adj: '形容詞',
      noun: '名詞',
      propn: '固有名詞',
      verb: '動詞',
      pron: '代名詞',
      det: '限定詞',
      art: '冠詞',
      prep: '前置詞',
      conj: '接続詞',
      adv: '副詞',
    },
    glosses: {
      she: '彼女',
      was: '〜だった、〜にいた（be の過去形）',
      tired: '① 疲れた ② うんざりした',
      so: '① だから、それで ② とても',
      went: '行った（go の過去形）',
      to: '① 〜へ、〜に ② 動詞の前に付く（to get）',
      bed: 'ベッド、寝床',
      early: '早く、早い',
      alice: 'アリス（人名）',
      beginning: '始める（begin の -ing 形）',
      get: '① 得る ② 〜になる',
      very: 'とても',
      of: '〜の。tired of では「〜にうんざり」',
      sitting: '座っている（sit の -ing 形）',
      by: '〜のそばに',
      her: '彼女の',
      sister: '姉、妹',
      on: '〜の上に',
      the: 'その、あの（特定のものを指す）',
      bank: '① 銀行 ② 土手、岸',
    },
    sentences: [
      {
        translation: '彼女は疲れていたので、早く寝ました。',
        note: {
          kind: 'usage',
          text: 'so は結果を表します。go to bed は「寝る」で、bed に the は付けません。',
        },
        context: 'ここでは「体が疲れて眠い」という意味で、「うんざり」ではありません。',
      },
      {
        translation: 'アリスは土手で姉のそばに座っていることに、とてもうんざりし始めていました。',
        note: {
          kind: 'idiom',
          text: 'get tired of doing：「〜することにうんざりする」。体の疲れではありません。',
        },
        context: 'on the bank は「土手で」という意味で、「銀行」ではありません。',
      },
    ],
    phrases: PHRASE_TEXTS.ja,
  },
  ko: {
    id: 'ko',
    learn: 'en',
    meaningLang: 'ko',
    pos: {
      adj: '형용사',
      noun: '명사',
      propn: '고유명사',
      verb: '동사',
      pron: '대명사',
      det: '한정사',
      art: '관사',
      prep: '전치사',
      conj: '접속사',
      adv: '부사',
    },
    glosses: {
      she: '그녀',
      was: '~였다, ~에 있었다 (be의 과거형)',
      tired: '① 피곤한 ② 싫증 난',
      so: '① 그래서, 그러므로 ② 매우',
      went: '갔다 (go의 과거형)',
      to: '① ~로, ~에 ② 동사 앞에 쓰임 (to get)',
      bed: '침대',
      early: '일찍, 이른',
      alice: '앨리스 (사람 이름)',
      beginning: '시작하다 (begin의 -ing형)',
      get: '① 얻다 ② ~해지다',
      very: '매우, 아주',
      of: "~의. tired of에서는 '~에 싫증 난'",
      sitting: '앉아 있는 (sit의 -ing형)',
      by: '~ 옆에',
      her: '그녀의',
      sister: '언니, 누나, 여동생',
      on: '~ 위에',
      the: '그 (특정한 것을 가리킴)',
      bank: '① 은행 ② 강둑',
    },
    sentences: [
      {
        translation: '그녀는 피곤해서 일찍 잠자리에 들었습니다.',
        note: {
          kind: 'usage',
          text: "so는 결과를 나타냅니다. go to bed는 '잠자리에 들다'이며 bed 앞에 the를 쓰지 않습니다.",
        },
        context: "여기서는 몸이 피곤해서 자고 싶다는 뜻이며, '싫증 난'이 아닙니다.",
      },
      {
        translation: '앨리스는 강둑에서 언니 곁에 앉아 있는 것에 아주 싫증이 나기 시작했습니다.',
        note: {
          kind: 'idiom',
          text: "get tired of doing: '~하는 것에 싫증이 나다'. 몸이 피곤하다는 뜻이 아닙니다.",
        },
        context: "on the bank는 '강둑에서'라는 뜻이며 '은행'이 아닙니다.",
      },
    ],
    phrases: PHRASE_TEXTS.ko,
  },
  ru: {
    id: 'ru',
    learn: 'en',
    meaningLang: 'ru',
    pos: {
      adj: 'прилагательное',
      noun: 'существительное',
      propn: 'имя собственное',
      verb: 'глагол',
      pron: 'местоимение',
      det: 'местоимение',
      art: 'артикль',
      prep: 'предлог',
      conj: 'союз',
      adv: 'наречие',
    },
    glosses: {
      she: 'она',
      was: 'был, была, было (be в прошедшем времени)',
      tired: '① уставший ② которому надоело',
      so: '① поэтому ② так, очень',
      went: 'пошёл, пошла, ушёл (go в прошедшем времени)',
      to: '① к, в ② стоит перед глаголом (to get)',
      bed: 'кровать, постель',
      early: 'рано, ранний',
      alice: 'Алиса (имя)',
      beginning: 'начинать (форма begin на -ing)',
      get: '① получать ② становиться',
      very: 'очень',
      of: 'предлог: «из», «от», «о»; в tired of значит «надоело»',
      sitting: 'сидеть (форма sit на -ing)',
      by: 'рядом с, у',
      her: 'её',
      sister: 'сестра',
      on: 'на',
      the: 'определённый артикль',
      bank: '① банк ② берег',
    },
    sentences: [
      {
        translation: 'Она устала, поэтому рано легла спать.',
        note: {
          kind: 'usage',
          text: 'so вводит следствие; go to bed — «ложиться спать», перед bed нет артикля the.',
        },
        context: 'Здесь значит «устала физически и хочет спать», а не «надоело».',
      },
      {
        translation: 'Алисе начинало очень надоедать сидеть рядом с сестрой на берегу.',
        note: {
          kind: 'idiom',
          text: 'get tired of doing — когда что-то надоедает; речь не о физической усталости.',
        },
        context: 'on the bank значит «на берегу», а не «в банке».',
      },
    ],
    phrases: PHRASE_TEXTS.ru,
  },
  es: {
    id: 'es',
    learn: 'en',
    meaningLang: 'es',
    pos: {
      adj: 'adjetivo',
      noun: 'sustantivo',
      propn: 'nombre propio',
      verb: 'verbo',
      pron: 'pronombre',
      det: 'determinante',
      art: 'artículo',
      prep: 'preposición',
      conj: 'conjunción',
      adv: 'adverbio',
    },
    glosses: {
      she: 'ella',
      was: 'era, estaba (pasado de be)',
      tired: '① cansado ② harto',
      so: '① así que ② tan, muy',
      went: 'fue, iba (pasado de go)',
      to: '① a, hacia ② va delante de un verbo (to get)',
      bed: 'cama',
      early: 'temprano',
      alice: 'Alicia (nombre)',
      beginning: 'empezando (forma -ing de begin)',
      get: '① conseguir ② ponerse, volverse',
      very: 'muy',
      of: 'de; en tired of significa «harto de»',
      sitting: 'sentado (forma -ing de sit)',
      by: 'junto a, al lado de',
      her: 'su (de ella)',
      sister: 'hermana',
      on: 'en, sobre',
      the: 'el, la, los, las',
      bank: '① banco ② orilla',
    },
    sentences: [
      {
        translation: 'Estaba cansada, así que se acostó temprano.',
        note: {
          kind: 'usage',
          text: 'so introduce la consecuencia; go to bed es «acostarse», sin the antes de bed.',
        },
        context: 'Aquí significa cansada físicamente, con sueño; no «harta».',
      },
      {
        translation:
          'Alicia empezaba a cansarse mucho de estar sentada junto a su hermana en la orilla.',
        note: {
          kind: 'idiom',
          text: 'get tired of doing: cansarse o aburrirse de hacer algo; no es cansancio físico.',
        },
        context: 'on the bank significa «en la orilla», no «en el banco».',
      },
    ],
    phrases: PHRASE_TEXTS.es,
  },
  fr: {
    id: 'fr',
    learn: 'en',
    meaningLang: 'fr',
    pos: {
      adj: 'adjectif',
      noun: 'nom',
      propn: 'nom propre',
      verb: 'verbe',
      pron: 'pronom',
      det: 'déterminant',
      art: 'article',
      prep: 'préposition',
      conj: 'conjonction',
      adv: 'adverbe',
    },
    glosses: {
      she: 'elle',
      was: 'était (passé de be)',
      tired: '① fatigué ② lassé',
      so: '① alors, donc ② si, tellement',
      went: 'est allé, allait (passé de go)',
      to: '① à, vers ② se place devant un verbe (to get)',
      bed: 'lit',
      early: 'tôt',
      alice: 'Alice (prénom)',
      beginning: 'commencer (forme en -ing de begin)',
      get: '① obtenir ② devenir',
      very: 'très',
      of: 'de ; dans tired of : « lassé de »',
      sitting: 'assis (forme en -ing de sit)',
      by: 'près de, à côté de',
      her: 'son, sa (à elle)',
      sister: 'sœur',
      on: 'sur',
      the: 'le, la, les',
      bank: '① banque ② rive, berge',
    },
    sentences: [
      {
        translation: "Elle était fatiguée, alors elle s'est couchée tôt.",
        note: {
          kind: 'usage',
          text: 'so introduit la conséquence ; go to bed = « se coucher », sans the devant bed.',
        },
        context: 'Ici, cela veut dire fatiguée physiquement, pas « lassée ».',
      },
      {
        translation:
          "Alice commençait à se lasser beaucoup d'être assise près de sa sœur sur la berge.",
        note: {
          kind: 'idiom',
          text: "get tired of doing : se lasser de faire quelque chose ; ce n'est pas une fatigue physique.",
        },
        context: 'on the bank veut dire « sur la berge », pas « à la banque ».',
      },
    ],
    phrases: PHRASE_TEXTS.fr,
  },
  en: {
    id: 'en',
    learn: 'fr',
    meaningLang: 'en',
    pos: {
      adj: 'adjective',
      noun: 'noun',
      propn: 'proper noun',
      verb: 'verb',
      pron: 'pronoun',
      det: 'determiner',
      art: 'article',
      prep: 'preposition',
      conj: 'conjunction',
      adv: 'adverb',
    },
    glosses: {
      elle: 'she',
      était: 'was (past of être)',
      fatiguée: 'tired, worn out',
      alors: 'so, then',
      "s'est": 'se + est: part of the past tense of se coucher',
      couchée: 'went to bed (from se coucher)',
      tôt: 'early',
      marie: "Marie (a girl's name)",
      commençait: 'was beginning (from commencer)',
      à: 'to, at; commencer à = to begin to',
      se: 'oneself (used with verbs such as se lasser)',
      lasser: 'to tire; se lasser = to get tired',
      "d'attendre": 'de + attendre: of waiting',
      son: 'his, her',
      frère: 'brother',
      sur: 'on',
      le: 'the',
      quai: '① quay ② train platform',
    },
    sentences: [
      {
        translation: 'She was tired, so she went to bed early.',
        note: {
          kind: 'usage',
          text: 'se coucher means to go to bed; alors introduces the result.',
        },
        context: 'The final -e matches elle: the person who is tired is a woman.',
      },
      {
        translation: 'Marie was beginning to get tired of waiting for her brother on the platform.',
        note: { kind: 'idiom', text: 'se lasser de + verb: to get tired of doing something.' },
        context:
          'Waiting for someone to arrive suggests a train platform here; quai can also mean a quay.',
      },
    ],
    phrases: PHRASE_TEXTS.en,
  },
};

export function isWordToken(token: string): boolean {
  return /\p{L}/u.test(token);
}

export function tokenKey(token: string): string {
  return token.toLowerCase();
}

export function sentenceText(tokens: readonly string[]): string {
  return tokens.reduce(
    (text, token, i) => (i === 0 || !isWordToken(token) ? text + token : `${text} ${token}`),
    '',
  );
}

export function lookupWord(set: DemoSet, token: string): WordEntry | undefined {
  const key = tokenKey(token);
  const lex = LEXICON[set.learn][key];
  const meaning = set.glosses[key];
  if (!lex || !meaning) return undefined;
  const head = lex.pos === 'propn' ? key.charAt(0).toUpperCase() + key.slice(1) : key;
  return { head, ipa: lex.ipa, pos: set.pos[lex.pos], meaning };
}

export type SpanResolution =
  | { kind: 'sentence'; from: number; to: number }
  | { kind: 'phrase'; from: number; to: number; text: string };

/** The smallest phrase that holds the words of a drag, else the whole sentence. The result's range is the highlight. */
export function resolveSpan(
  learn: LearnLang,
  sentence: number,
  from: number,
  to: number,
): SpanResolution {
  const { tokens } = SENTENCES[learn][sentence];
  const words: number[] = [];
  tokens.forEach((token, i) => {
    if (isWordToken(token)) words.push(i);
  });
  const whole: SpanResolution = {
    kind: 'sentence',
    from: words[0],
    to: words[words.length - 1],
  };
  const selected = words.filter((i) => i >= Math.min(from, to) && i <= Math.max(from, to));
  if (selected.length === 0 || selected.length === words.length) return whole;
  const first = selected[0];
  const last = selected[selected.length - 1];
  let best: SpanResolution | null = null;
  for (const span of PHRASE_SPANS[learn][sentence]) {
    if (span.from > first || span.to < last) continue;
    if (best === null || span.to - span.from < best.to - best.from) {
      best = { kind: 'phrase', from: span.from, to: span.to, text: span.text };
    }
  }
  return best ?? whole;
}

export function phraseTranslation(
  set: DemoSet,
  sentence: number,
  from: number,
  to: number,
): { text: string; translation: string } {
  const text = sentenceText(SENTENCES[set.learn][sentence].tokens.slice(from, to + 1));
  return { text, translation: set.phrases[sentence][text] ?? '' };
}
