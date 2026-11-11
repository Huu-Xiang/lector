#!/usr/bin/env python3
"""Build the data for the English vocabulary-size test and the library "vocabulary needed" table.

Outputs (both committed):
  languages/en/content/vocab-test.json
      Frequency bands of English lemmas (1,000 wide up to 10,000, then wider up to 40,000), each
      with a pool of 30 words that have a short Chinese gloss and their frequency rank (r). The test shows
      a word with four glosses from its band, so glosses are unique within a band.
  languages/en/content/library/vocab-needs.json
      For every English library book: {"n95": R, "n98": R, "cov": [c1 .. c14]}. R is the lemma
      rank that covers 95% / 98% of the running words (null if not reached by rank 20000;
      proper nouns count as known; Laufer & Nation). cov[i] is the share of running words a
      learner knows when they know every lemma ranked <= (i+1)*1000.

Inputs:
  --dict   dictionary-en.db (SQLite: entries, inflections, senses_i18n)
  The library manifests and lesson markdown under languages/en/content/library/.

Sources and licences:
  - Headwords, inflections and Chinese glosses: ECDICT (MIT licence), via dictionary-en.db.
  - Word frequencies: the `wordfreq` package (Robyn Speer), code under Apache-2.0. Its data is
    redistributable under CC BY-SA 4.0 and combines Google Books Ngrams, Leeds Internet Corpus,
    Wikipedia, ParaCrawl, OpenSubtitles and SUBTLEX (Brysbaert et al.; free for any use with
    credit). Only ranks and a sample of words are stored here, not the frequency data itself.
  - No LexTALE items are used.

Run (from the repository root):
  /Users/shawnhu/Dev/Lector/src/lector-growth/tmp/starter-venv/bin/python -I \\
      scripts/build-vocab-test.py --dict <dictionary-en.db>
"""

import argparse
import hashlib
import json
import math
import random
import re
import sqlite3
from bisect import bisect_right
from collections import Counter, defaultdict
from pathlib import Path

from wordfreq import word_frequency, zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "languages" / "en" / "content"
LIBRARY = CONTENT / "library"
OUT_TEST = CONTENT / "vocab-test.json"
OUT_NEEDS = LIBRARY / "vocab-needs.json"

SEED = 20261111
POOL_SIZE = 30
SPARE_SIZE = 10
GLOSSES = ROOT / "scripts" / "vocab-test-glosses.json"
MIN_FREQ = 1e-8  # zipf 1.0
BANDS = [(i * 1000 + 1, (i + 1) * 1000) for i in range(10)] + [
    (10001, 12500), (12501, 15000), (15001, 20000), (20001, 25000), (25001, 30000), (30001, 40000)]
SOURCE = "Word ranking: wordfreq (CC BY-SA 4.0), meanings: ECDICT (MIT)"

FIRST_NAMES = set("""
james john robert michael william david richard joseph thomas charles daniel matthew anthony mark
donald steven paul andrew joshua kenneth kevin brian george edward ronald timothy jason jeffrey ryan
jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel frank gregory
raymond alexander patrick jack dennis jerry tyler aaron henry douglas peter adam nathan zachary
walter kyle harold carl arthur gerald roger keith jeremy terry lawrence sean christian albert joe
ethan austin jesse willie billy bryan bruce jordan ralph roy noah dylan eugene wayne alan juan louis
russell gabriel randy philip harry vincent bobby johnny logan
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty margaret
sandra ashley kimberly emily donna michelle carol amanda dorothy melissa deborah stephanie rebecca
sharon laura cynthia kathleen amy angela shirley anna brenda pamela emma nicole helen samantha
katherine christine debra rachel carolyn janet catherine maria heather diane olivia julie joyce
victoria kelly christina lauren joan evelyn judith megan cheryl andrea hannah jacqueline martha
gloria teresa ann sara madison frances kathryn janice jean abigail alice judy sophia grace denise
amber doris marilyn danielle beverly isabella theresa diana natalie brittany charlotte marie kayla
alexis lori
""".split())
# Months and days are proper nouns. 'may' and 'march' are also words, but are kept out too.
CALENDAR = set("""january february march april may june july august september october november
december monday tuesday wednesday thursday friday saturday sunday""".split())

BLOCKLIST = set("""
fuck fucking fucker fucked shit shitty bitch bitches bastard asshole arse arsehole ass damn damned
dick dicks cock cocks pussy cunt whore slut tits tit boob boobs penis vagina anus rectum orgasm
orgasms sex sexy sexual sexually erotic erotica porn porno pornography nude naked masturbate
masturbation fellatio rape raped rapist molest molester prostitute prostitution brothel semen
sperm testicle testicles scrotum clitoris nipple nipples breast breasts crap piss pissed turd
wank wanker bugger bollocks nigger negro fag faggot dyke retard retarded cripple homo
queer gay lesbian bisexual hooker pimp stripper lust lustful incest pedophile hell
kill killer murder murderer suicide genocide massacre
""".split())

NAME_MARKERS = ("人名", "姓氏", "地名", "城市名", "音译", "男子名", "女子名", "教名", "首都",
                "港市", "国名", "州名", "河名", "共和国首都", "国家", "城市")
ABBR_MARKERS = ("缩写", "abbr", "的简称", "首字母缩")
VULGAR_TAG = re.compile(r"[\[\(（〈<【][^\]\)）〉>】]*(粗|俚|下流|脏话)[^\]\)）〉>】]*[\]\)）〉>】]")
VULGAR_PLAIN = ("性交", "脏话", "下流")
EXTRA_NONWORDS = {"ok", "oh", "ah", "um", "uh", "eh", "hmm", "hey", "hi", "yeah", "wow", "ha",
                  "aa", "bb", "cc", "dd", "mr", "mrs", "ms", "dr", "vs", "etc", "pm", "am",
                  "ve", "ll", "re", "bye", "abc", "jew", "jews", "fbi", "itv", "cia", "bbc", "dunno",
                  "gonna", "wanna", "gotta", "spec"}
# Words kept out of the test but counted as known when a book is scored.
KNOWN_ALWAYS = {"a", "i"}
EXTRA_FORMS = {"am": "be", "are": "be", "were": "be", "learnt": "learn", "quitted": "quit",
               "borne": "bear", "spelt": "spell", "dreamt": "dream", "burnt": "burn",
               "spoilt": "spoil", "leapt": "leap", "knelt": "kneel", "smelt": "smell",
               # irregular or old-style past forms that the inflections table lacks (found in the books)
               "leaped": "leap", "knowed": "know", "lied": "lie", "waked": "wake",
               "awaked": "awake", "spelled": "spell", "leant": "lean", "besought": "beseech",
               "bethought": "bethink", "durst": "dare", "betook": "betake", "betaken": "betake",
               "kneeled": "kneel", "growed": "grow", "blowed": "blow", "dropt": "drop",
               "stopt": "stop", "wrapt": "wrap", "gotten": "get", "strewed": "strew",
               "kep": "keep", "slep": "sleep", "sallied": "sally", "quarreled": "quarrel",
               "reveled": "revel", "gossiped": "gossip", "throve": "thrive", "spilt": "spill",
               "buffaloes": "buffalo", "volcanoes": "volcano", "mosquitoes": "mosquito"}
ROMAN_NUMERALS = {"ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv",
                  "xvi", "xvii", "xviii", "xix", "xx", "mm", "dc", "cd", "cm", "xl", "lx", "lv",
                  "mc", "md", "ml", "cl", "dl", "ld", "dm", "id"}

PLACES_ETC = set("""
china japan korea india russia france germany italy spain england britain scotland ireland wales
canada mexico brazil argentina chile peru cuba egypt israel iran iraq turkey greece poland sweden
norway denmark finland holland netherlands belgium switzerland austria portugal australia africa
asia europe america american americans chinese japanese korean indian russian french german italian
spanish english british scottish irish welsh canadian mexican european african asian arab arabic
jewish hebrew latin greek roman roman catholic protestant christian muslim islam islamic buddhist
hindu london paris berlin rome madrid moscow beijing tokyo york texas california florida chicago
boston washington jesus buddha christ christmas easter halloween thanksgiving ghana tunisia lanka
kyoto rio seattle illinois michigan ohio nazi nazis
iceland scots scotch dutch swiss swedish danish norwegian finnish polish turkish vietnam thai
thailand taiwan tibet ukraine syria libya sudan kenya nigeria cairo vienna venice athens havana
""".split())
TRANSLIT = set("阿艾安奥巴贝比波布查达德迪恩尔法菲费弗福盖格哈海赫亨霍吉加杰卡凯康克科拉莱兰劳勒雷里利林卢罗洛马玛迈曼梅米蒙摩姆纳尼诺努欧帕佩皮普齐奇恰琼萨塞赛桑沙舍圣斯苏索塔泰坦汤特托图瓦威韦维乌西希夏谢休亚耶伊约扎泽詹兹祖慕根纽瓦")
PLACE_SUFFIX = "州市岛郡港河湖国城省镇"


def freq(word):
    return word_frequency(word, "en")


# ---------- gloss handling ----------

BRACKETS = re.compile(r"\[[^\]]*\]|\([^)]*\)|（[^）]*）|〈[^〉]*〉|<[^>]*>|【[^】]*】|《[^》]*》")
CJK = re.compile(r"[一-鿿]")
POS_PREFIX = re.compile(r"^(?:[a-z]+\.\s*)+")


def gloss_segments(gloss):
    text = BRACKETS.sub("", gloss)
    out = []
    for seg in re.split(r"[,，;；、/\n]", text):
        seg = POS_PREFIX.sub("", seg.strip()).strip(" .。:：")
        if CJK.search(seg) and not seg.endswith(("的过去式", "的复数", "的过去分词", "的现在分词")):
            out.append(seg)
    return out


def short_gloss(senses):
    """First sense, unless an early sense has far more listed meanings (give: 给, not 弹性)."""
    parsed = [(o, gloss_segments(g)) for o, _, g in sorted(senses)]
    parsed = [(o, s) for o, s in parsed if s]
    if not parsed:
        return None
    pick = parsed[0][1]
    best = max(parsed[:3], key=lambda x: len(x[1]))[1]
    if len(best) >= max(6, 3 * len(pick)):
        pick = best
    return pick[0][:20]


# ---------- dictionary and ranking ----------

def load_dictionary(path):
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    entries = [r[0] for r in con.execute("select word from entries")]
    form_to_lemmas = defaultdict(set)
    lemma_to_forms = defaultdict(set)
    for form, lemma in con.execute("select inflected_form, lemma from inflections"):
        form_to_lemmas[form].add(lemma)
        lemma_to_forms[lemma].add(form)
    senses = defaultdict(list)
    for w, pos, gloss, order in con.execute(
            "select word, pos, gloss, sort_order from senses_i18n where lang='zh-CN'"):
        senses[w].append((order, pos or "", gloss or ""))
    meta = {w: ((c or 0), (o or 0), (t or "")) for w, c, o, t in con.execute(
        "select word, collins, oxford, tags from entry_meta")}
    con.close()
    return entries, form_to_lemmas, lemma_to_forms, senses, meta


def fix_inflections(form_to_lemmas, lemma_to_forms, senses):
    """Repair the inflection tables in place; return the words made their own lemma.

    1. Add missing forms ("are", "learnt").
    2. A word that is more frequent than every lemma it points to is its own lemma
       ("number" vs "numb", "building" vs "build", "his" vs "hi").
    3. Follow chains so a form points to a base word ("thoughts" -> "think").
    """
    for f, l in EXTRA_FORMS.items():
        form_to_lemmas[f].add(l)
    promoted = []
    for f, lemmas in list(form_to_lemmas.items()):
        if f in EXTRA_FORMS or f not in senses or not f.isalpha() or f in lemmas:
            continue
        if freq(f) > max(freq(l) for l in lemmas):
            del form_to_lemmas[f]
            promoted.append(f)

    def base(word, seen):
        nxt = form_to_lemmas.get(word)
        if not nxt or word in seen:
            return {word}
        out = set()
        for l in nxt:
            out |= base(l, seen | {word}) if l != word else {word}
        return out

    flat = {f: base(f, frozenset()) - {f} or {f} for f in list(form_to_lemmas)}
    form_to_lemmas.clear()
    form_to_lemmas.update(flat)
    lemma_to_forms.clear()
    for f, ls in flat.items():
        for l in ls:
            lemma_to_forms[l].add(f)
    return promoted


def exclusion_reason(word, sense_list):
    if word in BLOCKLIST:
        return "offensive"
    if word in FIRST_NAMES or word in CALENDAR or word in PLACES_ETC:
        return "name"
    if word in ROMAN_NUMERALS:
        return "roman"
    if word in EXTRA_NONWORDS:
        return "interjection"
    first_order = min(o for o, _, _ in sense_list)
    first_text = " ".join(g for o, _, g in sense_list if o == first_order)
    if any(m in first_text for m in NAME_MARKERS):
        return "name"
    first_pos = {p for o, p, _ in sense_list if o == first_order}
    if "abbr" in first_pos:
        return "abbr"
    seg = BRACKETS.sub("", first_text).split("，")[0].split("；")[0].strip()
    if len(seg) >= 3 and seg[-1] in PLACE_SUFFIX and all(c in TRANSLIT for c in seg[:-1]):
        return "name"
    if len(seg) >= 2 and all(c in TRANSLIT for c in seg) and len(sense_list) == 1:
        return "name"
    if any(m in first_text for m in ABBR_MARKERS):
        return "abbr"
    if VULGAR_TAG.search(first_text) or any(m in first_text for m in VULGAR_PLAIN):
        return "offensive"
    if not any(CJK.search(g) for _, _, g in sense_list):
        return "nogloss"
    return None


def build_ranking(entries, form_to_lemmas, lemma_to_forms, senses):
    own_lemma = {f for f, ls in form_to_lemmas.items() if f in ls}
    excluded = defaultdict(set)
    scored = []
    for w in entries:
        if not (w.isascii() and w.isalpha() and w.islower()) or len(w) < 2:
            continue
        if w in form_to_lemmas and w not in own_lemma:
            continue
        if w not in senses or freq(w) <= MIN_FREQ:
            continue
        why = exclusion_reason(w, senses[w])
        if why:
            excluded[why].add(w)
            continue
        total = freq(w)
        for f in sorted(lemma_to_forms.get(w, ())):
            if f != w and f.isalpha() and f.isascii():
                # a form shared by several lemmas ("leaves") is split between them
                total += freq(f) / len(form_to_lemmas[f])
        scored.append((total, w))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return {w: i + 1 for i, (_, w) in enumerate(scored)}, excluded


# ---------- pool rules ----------
# A pool word must be its own lemma: no -ed/-ing form, no plural. These words stay in the
# ranking (they count in the book scores) but never appear in the test.
POOL_EXCLUDE = set("""
postdate externalize budgerigar
tee tandem veg furlong imbecile sop bimbo canto inasmuch foetus leukaemia ravel cornucopia telex cloture seventieth lapidary heliotrope nucleate photosphere plaice unbend
married beginning located teeth injured retired photographs breathing sustained archives clothes
labour harbour kilometre aluminium diaper
virgin shooter stab holocaust gore suicidal intimate
lcd buffalo sully
yummy tot viva peck fiat rue brat saloon
southwestern statewide
flavour judgement practise organise litre cheque armor fiber motorway
caucasian gypsy atlantic antarctica catholicism trinity darn tout roach vale toot overdose
atrocity brutality addict gunner dab smack bandwagon
butt pickup mistress squash qualifier goodnight brethren englishman goggle
jan cambridge imf poly afro whig rhino mesa fore pee prof idiot marijuana gunman autopsy rampage
staffer teller sow
over thy champ superman ottawa airway ghetto giveaway seduce testosterone chemotherapy poo briton
chaser cheddar sampler execution bound retainer sucker
""".split())
# Common adjectives that end in -ed or -ing; they are allowed in the pool.
POOL_ADJ_OK = set("""
sickening interesting exciting amazing boring willing surprising frightening disappointing
tired excited bored wicked naked crooked sacred learned beloved aged talented skilled gifted
saturated determined devoted ragged involved
""".split())
# Plural-looking words that are not plurals of another listed word.
POOL_PLURAL_OK = {"headquarters", "series", "species", "news", "billiards"}

# Hand-written meanings (main modern sense, 2-6 characters) where the ECDICT first sense is
# wrong, rare or misleading.
GLOSS_OVERRIDES = {
    "involved": "参与的", "western": "西方的", "realize": "意识到", "multiple": "多个的",
    "border": "边界", "squad": "小队", "pole": "杆", "franchise": "特许经营", "sake": "缘故",
    "equation": "方程式", "artwork": "艺术品", "dining": "用餐", "locker": "储物柜",
    "steering": "转向装置", "offend": "冒犯", "exploitation": "剥削", "economically": "经济上",
    "rave": "狂欢", "splendid": "极好的", "childish": "幼稚的", "collateral": "抵押品",
    "podium": "领奖台", "residency": "居住", "shady": "阴凉的", "irrational": "不合理的",
    "spree": "狂欢", "sleeper": "卧铺", "waffle": "华夫饼", "pip": "果核", "skyline": "天际线",
    "puncture": "刺穿", "mover": "搬家工人", "hunch": "直觉", "sickening": "令人作呕的",
    "unwind": "放松", "agrarian": "农业的", "wiggle": "扭动", "curtain": "窗帘", "weave": "编织",
    "swell": "肿胀", "quantum": "量子", "gum": "口香糖", "depression": "抑郁", "import": "进口",
    "arena": "竞技场", "wreck": "残骸", "sire": "父亲（尊称）",
    "miss": "错过", "write": "写", "major": "主要的", "dark": "黑暗的", "feature": "特征",
    "truth": "真相", "option": "选项", "hide": "隐藏", "load": "负载", "queen": "女王",
    "hall": "大厅", "achieve": "实现", "appeal": "呼吁", "folk": "民间的", "guarantee": "保证",
    "chemical": "化学品", "mode": "模式", "shoulder": "肩膀", "bell": "铃铛", "minor": "较小的",
    "button": "纽扣", "chamber": "厅室", "accurate": "准确的", "celebrity": "名人",
    "shout": "喊叫", "disaster": "灾难", "formula": "公式", "successfully": "成功地",
    "weigh": "称重", "innovation": "创新", "venue": "场地", "trailer": "拖车", "warrant": "令状",
    "punishment": "惩罚", "tribe": "部落", "dawn": "黎明", "clay": "黏土", "particle": "粒子",
    "bin": "箱子", "accent": "口音", "bud": "花蕾", "coalition": "联盟", "witch": "女巫",
    "grocery": "杂货店", "recipient": "接受者", "collector": "收藏家", "rhythm": "节奏",
    "meaningful": "有意义的", "bankruptcy": "破产", "roster": "名册", "bloom": "开花",
    "dairy": "乳制品", "casualty": "伤亡人员", "rapper": "说唱歌手", "shallow": "浅的",
    "vein": "静脉", "drown": "溺水", "shortage": "短缺", "magnificent": "壮丽的", "peel": "剥皮",
    "coup": "政变", "crow": "乌鸦", "memoir": "回忆录", "melody": "旋律", "yacht": "游艇",
    "tenure": "任期", "profound": "深刻的", "unconscious": "无意识的", "haunt": "闹鬼",
    "aggression": "侵略", "coordination": "协调", "inflict": "使遭受", "cleanse": "使洁净",
    "transcript": "文字记录", "psychiatric": "精神科的", "cereal": "麦片", "tract": "区域",
    "shrine": "神龛", "perceive": "察觉", "innocence": "清白", "brew": "酿造", "retention": "保留",
    "reliance": "依赖", "compartment": "隔间", "discourage": "劝阻", "ambush": "伏击",
    "salty": "咸的", "inflammation": "炎症", "continuation": "延续", "widen": "加宽",
    "masculine": "男性的", "spontaneous": "自发的", "apt": "易于", "buckle": "扣环", "zen": "禅",
    "perimeter": "周边", "trajectory": "轨迹", "harass": "骚扰", "communal": "公共的",
    "smoothly": "顺利地", "fugitive": "逃犯", "simplify": "简化", "unlucky": "不幸的",
    "savannah": "稀树草原", "discredit": "使丧失信誉", "wrench": "扳手", "fertile": "肥沃的",
    "knob": "旋钮", "unrest": "动乱", "sandstone": "砂岩", "humorous": "幽默的",
    "hoard": "囤积", "abort": "中止", "devour": "狼吞虎咽", "convent": "女修道院",
    "migraine": "偏头痛", "endanger": "危害", "cheeky": "无礼的", "expectancy": "预期",
    "antagonist": "对手", "trolley": "手推车", "inlet": "小海湾", "conjure": "变戏法",
    "pivotal": "关键的", "hiatus": "中断", "defiance": "反抗", "sweetness": "甜味",
    "disseminate": "传播", "populist": "民粹主义者", "endemic": "地方性的", "plaid": "格子呢",
    "munch": "咀嚼", "joyous": "欢乐的", "malignant": "恶性的", "brigadier": "准将",
    "janitor": "看门人", "glorify": "颂扬", "fluctuate": "波动", "adamant": "坚决的",
    "clergyman": "神职人员", "ingenuity": "独创性", "stanza": "诗节", "pitcher": "投手",
    "customer": "顾客", "priority": "优先事项", "importance": "重要性", "surely": "肯定地",
    "angle": "角度", "knife": "刀", "alien": "外星人", "satellite": "卫星", "combine": "结合",
    "downtown": "市中心", "decent": "体面的", "patent": "专利", "intense": "强烈的",
    "elementary": "基础的", "rude": "粗鲁的", "enhance": "增强", "exclusively": "仅仅",
    "actively": "积极地", "shave": "剃须", "drone": "无人机", "thunder": "雷声",
    "stall": "摊位", "adapt": "适应", "module": "模块", "dodge": "躲避", "dictionary": "词典",
    "triumph": "胜利", "optical": "光学的", "shrink": "缩小", "adorable": "可爱的",
    "brace": "支架", "speculation": "猜测", "binary": "二进制的", "forbidden": "禁止的",
    "flyer": "传单", "flank": "侧翼", "chorus": "合唱", "optic": "视觉的", "lone": "孤独的",
    "cod": "鳕鱼", "advancement": "进步", "embark": "登船", "escalate": "升级", "gown": "礼服",
    "interrupt": "打断", "conquest": "征服", "commute": "通勤", "coward": "懦夫",
    "sticky": "黏的", "sabotage": "破坏", "squadron": "中队", "simplicity": "简单",
    "shin": "胫部", "vain": "徒劳的", "solitary": "孤独的", "induction": "归纳",
    "feasible": "可行的", "inflammatory": "煽动性的", "caravan": "大篷车", "signify": "表示",
    "duct": "管道", "pentagon": "五边形", "inhibitor": "抑制剂", "rift": "裂痕", "sect": "教派",
    "chic": "时髦的", "emblem": "徽章", "extinct": "灭绝的", "antiquity": "古代",
    "inception": "开端", "pineapple": "菠萝", "dine": "用餐", "clinch": "敲定",
    "formulation": "表述", "peasant": "农民", "helper": "帮手", "turret": "炮塔",
    "emulate": "仿效", "reinstate": "恢复", "citrus": "柑橘", "seaside": "海边",
    "filler": "填充物", "fluctuation": "波动", "recharge": "充电", "counterfeit": "伪造的",
    "tyranny": "暴政", "caterpillar": "毛毛虫", "lagoon": "泻湖", "relapse": "复发",
    "mingle": "交往", "festivity": "庆祝活动", "pinnacle": "顶峰", "errand": "差事",
    "superpower": "超级大国", "coop": "鸡笼", "beak": "鸟喙", "genealogy": "家谱",
    "curfew": "宵禁", "terrier": "梗犬", "aroma": "香气", "bitterly": "苦涩地",
    "seminal": "开创性的", "jargon": "行话", "giddy": "头晕的", "preferential": "优惠的",
    "just": "刚刚", "due": "到期的", "project": "项目", "serve": "服务", "director": "总监",
    "amount": "数量", "cross": "穿过", "spot": "地点", "concern": "担忧", "business": "商业",
    "extra": "额外的", "raise": "提高", "generation": "世代", "ban": "禁止", "zone": "区域",
    "mental": "精神的", "fellow": "同伴", "grab": "抓住", "supreme": "最高的",
    "distribution": "分发", "broad": "宽的", "perspective": "视角", "recall": "回想",
    "cheese": "奶酪", "pump": "泵", "principal": "主要的", "sum": "总和", "mystery": "神秘",
    "rough": "粗糙的", "pace": "步伐", "lean": "倾斜", "pit": "坑", "smash": "粉碎",
    "radical": "激进的", "cow": "奶牛", "ethnic": "种族的", "cape": "海角", "cheer": "欢呼",
    "prompt": "迅速的", "protocol": "协议", "peaceful": "和平的", "racism": "种族歧视",
    "facilitate": "促进", "unity": "团结", "ballot": "选票", "couch": "沙发", "tender": "温柔的",
    "ethics": "伦理", "comply": "遵守", "infinite": "无限的", "bacon": "培根",
    "correction": "纠正", "migrant": "移民", "scroll": "卷轴", "grandma": "祖母",
    "cylinder": "圆柱体", "severely": "严重地", "hull": "船体", "orientation": "方向",
    "nicely": "好好地", "revive": "复苏", "panther": "黑豹", "fridge": "冰箱", "metric": "公制的",
    "admiral": "海军上将", "tease": "取笑", "minimize": "最小化", "prosecute": "起诉",
    "slate": "石板", "intersection": "十字路口", "detention": "拘留", "specify": "指定",
    "pardon": "原谅", "rhetoric": "修辞", "descent": "下降", "quiz": "测验",
    "enjoyable": "愉快的", "torch": "火炬", "positively": "积极地", "prospective": "未来的",
    "rehearsal": "排练", "arbitrary": "随意的", "prohibition": "禁止", "lecturer": "讲师",
    "probation": "试用期", "align": "对齐", "swipe": "划过", "serum": "血清",
    "lateral": "侧面的", "infamous": "臭名昭著的", "singular": "单数的", "potent": "强效的",
    "announcer": "播音员", "presently": "不久", "respectful": "恭敬的", "akin": "类似的",
    "compile": "编纂", "countdown": "倒计时", "cascade": "瀑布", "skeptical": "怀疑的",
    "shear": "剪", "pavilion": "亭子", "slab": "厚板", "scramble": "争抢", "mural": "壁画",
    "steward": "乘务员", "moose": "驼鹿", "hydrate": "补水", "secrecy": "保密",
    "superficial": "肤浅的", "oneself": "自己", "quilt": "被子", "skim": "略读",
    "tandem": "串联", "brood": "一窝雏鸟", "hone": "磨砺", "incarnation": "化身",
    "profoundly": "深刻地", "trendy": "时髦的", "concurrent": "同时发生的", "relish": "享受",
    "sturdy": "结实的", "bleak": "荒凉的", "topical": "时事的", "scatter": "散开",
    "repercussion": "反响", "broth": "肉汤", "centenary": "百年纪念", "hindsight": "事后聪明",
    "deflection": "偏转", "maestro": "大师", "assortment": "什锦", "silica": "二氧化硅",
    "normalize": "使正常化", "stampede": "惊逃", "fabricate": "编造", "cordon": "警戒线",
    "kid": "小孩", "lord": "领主", "misrepresent": "歪曲", "withstand": "经受",
    "unlike": "不同于", "mind": "头脑", "tan": "棕褐色", "classy": "高档的", "garrison": "驻军",
    "cerebral": "大脑的", "hurl": "猛掷", "cyst": "囊肿", "simplistic": "过于简单的",
    "bale": "大包", "bearer": "持有人", "dominion": "统治权", "examination": "考试",
    # Second review (multiple-choice keys must be the main modern sense)
    "particular": "特别的",
    "cost": "成本",
    "volume": "体积",
    "liberal": "自由的",
    "associate": "联系",
    "scream": "尖叫",
    "remarkable": "非凡的",
    "transit": "运输",
    "stack": "一堆",
    "tan": "晒黑",
    "mere": "仅仅的",
    "subtle": "微妙的",
    "treasurer": "财务主管",
    "caption": "图片说明",
    "abide": "遵守",
    "lunar": "月球的",
    "bale": "大捆",
    "weaver": "织工",
    "illuminate": "照亮",
    "competence": "能力",
    "pebble": "鹅卵石",
    "jackpot": "头奖",
    "keynote": "基调",
    "brood": "一窝",
    "squid": "鱿鱼",
    "plumber": "水管工",
    "quantify": "量化",
    "spew": "喷出",
    "hindsight": "事后的认识",
    "scarcely": "几乎不",
    "assortment": "各种各样",
    "centenary": "一百周年",
    "nectar": "花蜜",
    "observance": "遵守",
    "whitewash": "粉饰",
    "stampede": "蜂拥",
    "stiffness": "僵硬",
    "debacle": "惨败",
    "finalize": "最终确定",
    "pout": "噘嘴",
    "householder": "户主",
    "patriarchy": "父权制",
    "informer": "告密者",
    "appetizer": "开胃菜",
    "contiguous": "相邻的",
    "sleazy": "低俗的",
    "garb": "服装",
    "geyser": "间歇泉",
    "caustic": "刻薄的",
    "clench": "握紧",
    "calibrate": "校准",
    "titular": "名义上的",
    "boisterous": "喧闹的",
    "feverish": "发烧的",
    "unruly": "难管束的",
    "granule": "颗粒",
    "pungent": "刺鼻的",
    "humanistic": "人文主义的",
    "rancid": "腐臭的",
    "preeminent": "杰出的",
    "gape": "目瞪口呆地看",
    "icicle": "冰柱",
    "vicarage": "牧师住宅",
    "amble": "漫步",
    "bauble": "小玩意",
    "infirm": "体弱的",
    "tactful": "得体的",
    "symbiosis": "共生",
    "emolument": "报酬",
    "acquaint": "使熟悉",
    "jubilation": "欢腾",
    "assail": "抨击",
    "warplane": "战机",
    "oversize": "特大的",
    "apprise": "告知",
    "larder": "食品储藏室",
    "unpalatable": "难吃的",
    "cavalcade": "游行队伍",
    "incredulity": "怀疑",
    "herculean": "艰巨的",
    "upturn": "好转",
    "numismatic": "钱币的",
    "fop": "花花公子",
    "forbearance": "克制",
    "overwrought": "过度紧张的",
    "dietetics": "营养学",
    "cantankerous": "脾气坏的",
    "sunbathe": "晒日光浴",
    "superintend": "监督",
    "hoary": "白发苍苍的",
    "compunction": "内疚",
    "dawdle": "磨蹭",
    "egoism": "利己主义",
    "impartially": "公正地",
    "intermingle": "混合",
    "deforest": "砍伐森林",
    "subdivide": "细分",
    "exculpate": "开脱罪责",
    "derogate": "贬低",
    "effulgent": "灿烂的",
    "glutinous": "黏稠的",
    "braggart": "吹牛的人",
    "greengrocer": "果蔬商",
    "arrhythmic": "心律不齐的",
    "defoliate": "使落叶",
    "pyromania": "纵火癖",
    "quaver": "颤抖",
    "garrulous": "话多的",
    "hemostat": "止血钳",
    "seminar": "研讨会",
    "vanguard": "先锋",
    "discreet": "谨慎的",
    "ramification": "后果",
    "chasm": "鸿沟",
    "inalienable": "不可剥夺的",
    "panache": "派头",
    "dismember": "肢解",
    "consecrate": "奉为神圣",
    "entrap": "诱骗",
    "overeat": "吃得过多",
    "vitiate": "损害",
    "intoxicate": "使喝醉",
    "seemly": "得体的",
    "carcinogen": "致癌物",
    "convoke": "召集",
    "unctuous": "油腔滑调的",
    "conviviality": "欢乐气氛",
    "manumit": "释放奴隶",
}


def spelling_variants(w):
    """Other-region spellings of w: colour/color, centre/center, dialogue/dialog, defence/defense,
    and the British -ise/-yse forms of -ize/-yze (the -ize forms are used in both regions)."""
    out = set()
    if w.endswith("our"):
        out.add(w[:-3] + "or")
    if w.endswith("or"):
        out.add(w[:-2] + "our")
    if len(w) > 3 and w.endswith("re") and w[-3] not in "aeiou":
        out.add(w[:-2] + "er")
    if len(w) > 3 and w.endswith("er") and w[-3] not in "aeiou":
        out.add(w[:-2] + "re")
    for a, b in (("ogue", "og"), ("og", "ogue"), ("ence", "ense"), ("ense", "ence")):
        if w.endswith(a):
            out.add(w[:-len(a)] + b)
    return out


def british_ise(w, entries):
    for a, b in (("ise", "ize"), ("yse", "yze")):
        if w.endswith(a) and w[:-3] + b in entries:
            return True
    return False


def pool_ok(w, ranking, entries):
    if w in POOL_EXCLUDE or british_ise(w, entries) or spelling_variants(w) & entries:
        return False
    if w.endswith(("ing", "ed")) and w not in POOL_ADJ_OK:
        return False
    if w.endswith("s") and not w.endswith(("ss", "us", "is", "ics")) and w not in POOL_PLURAL_OK:
        singles = {w[:-1], w[:-2]}
        if w.endswith("ies"):
            singles.add(w[:-3] + "y")
        if any(x in ranking for x in singles):
            return False
    return True


# ---------- bands ----------

def spread(items, n):
    """One item from each of n equal slices, picked by a seeded hash."""
    out = []
    for k in range(n):
        part = items[k * len(items) // n:(k + 1) * len(items) // n]
        out.append(min(part, key=lambda x: hashlib.sha1(f"{SEED}:{x[0]}".encode()).hexdigest()))
    return out


def build_bands(ranking, senses, meta, entries):
    """Pools use only words that a learner list marks (Collins, Oxford or an exam tag). Without
    that mark about half of the rare entries are names, places or abbreviations."""
    by_rank = sorted(ranking, key=ranking.get)
    bands = []
    for lo, hi in BANDS:
        glossed = [(w, GLOSS_OVERRIDES.get(w) or short_gloss(senses[w]))
                   for w in by_rank[lo - 1:hi] if pool_ok(w, ranking, entries)]
        glossed = [(w, g) for w, g in glossed if g and any(meta.get(w, (0, 0, "")))]
        # Two words with the same gloss in one band would make a question with two right answers.
        seen_gloss = set()
        glossed = [x for x in glossed if not (x[1] in seen_gloss or seen_gloss.add(x[1]))]
        glossed = [x for x in glossed if len(x[1]) <= 12] if sum(len(x[1]) <= 12 for x in glossed) >= 100 else glossed
        pref = [x for x in glossed if 3 <= len(x[0]) <= 12]
        src = pref if len(pref) >= POOL_SIZE * 2 else glossed
        # One word from each of POOL_SIZE equal slices of the band, picked by a seeded hash, so the
        # pool spreads over the band and stays stable when a word is added to POOL_EXCLUDE.
        chosen = spread(src, POOL_SIZE)
        taken = {w for w, _ in chosen}
        # Spares replace pool words whose curated meanings fail the checks below.
        spares = spread([x for x in src if x[0] not in taken], SPARE_SIZE)
        chosen.sort(key=lambda x: ranking[x[0]])
        spares.sort(key=lambda x: ranking[x[0]])
        bands.append({"from": lo, "to": hi,
                      "words": [{"w": w, "zh": g, "r": ranking[w]} for w, g in chosen],
                      "spares": [{"w": w, "zh": g, "r": ranking[w]} for w, g in spares]})
    return bands


# ---------- curated meanings ----------
# scripts/vocab-test-glosses.json maps each pool and spare word to one or two rows:
# {"p": part of speech, "zh": up to three Chinese meanings, "en": a short English definition}.
# Every answer option shows these rows, so they are written and checked by hand (the dictionary's
# first English sense is often rare: "bank" starts with "sloping land").

POS_LABELS = {"noun": "n.", "verb": "v.", "adj": "adj.", "adv": "adv.", "prep": "prep.",
              "conj": "conj.", "pron": "pron.", "num": "num.", "intj": "int.", "aux": "aux.",
              "det": "det."}
ALLOWED_POS = set(POS_LABELS.values())
# Characters too common in meanings to make two meanings look alike; keep in step with
# FILLER in src/lib/vocab-test.ts.
FILLER = set("的地得使之者人性化物一.…了")
MAX_EN_WORDS = 8


def draft_rows(sense_list):
    rows = {}
    for _, pos, gloss in sorted(sense_list):
        label = POS_LABELS.get(pos, "?")
        rows.setdefault(label, [])
        for seg in gloss_segments(gloss):
            if seg not in rows[label]:
                rows[label].append(seg)
    return [{"p": p, "zh": zh[:6]} for p, zh in rows.items() if zh][:3]


def word_forms(w, lemma_to_forms):
    return {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "ly"} | set(lemma_to_forms.get(w, ()))


def gloss_problem(rows, forms):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2:
        return "needs one or two rows"
    seen = set()
    for row in rows:
        p, zh, en = row.get("p"), row.get("zh"), row.get("en")
        if p not in ALLOWED_POS or p in seen:
            return f"bad part of speech {p!r}"
        seen.add(p)
        if not isinstance(zh, list) or not 1 <= len(zh) <= 3:
            return "needs one to three Chinese meanings"
        for m in zh:
            if not isinstance(m, str) or not 1 <= len(m) <= 8 or re.search(r"[A-Za-z]", m) or not CJK.search(m):
                return f"bad Chinese meaning {m!r}"
        if not isinstance(en, str) or not en.strip():
            return "missing English line"
        words = re.findall(r"[A-Za-z']+", en)
        if not 1 <= len(words) <= MAX_EN_WORDS or len(en.split()) > MAX_EN_WORDS:
            return f"English line too long: {en!r}"
        if re.search(r"[A-Z]", en[1:]):
            return f"English line has a name or capital: {en!r}"
        lowered = {x.lower() for x in words}
        if lowered & forms:
            return f"English line uses the word itself: {en!r}"
    return None


def signature(rows):
    return tuple(r["p"] for r in rows)


def option_width(rows):
    """Rough rendered width: a Chinese character is about twice a Latin letter, and the English
    line is in a smaller font. Keep in step with optionWidth in src/lib/vocab-test.ts."""
    return sum(sum(len(m) for m in r["zh"]) + 0.45 * len(r["en"]) for r in rows)


def meaning_chars(rows):
    return {c for r in rows for m in r["zh"] for c in m if c not in FILLER}


def can_distract(target, other, forms):
    """Whether `other` may be a wrong option for `target` (both {w, s} entries)."""
    if other["w"] == target["w"]:
        return False
    if meaning_chars(target["s"]) & meaning_chars(other["s"]):
        return False
    tw, ow = option_width(target["s"]), option_width(other["s"])
    if not 0.6 * tw <= ow <= 1.4 * tw:
        return False
    en = {x.lower() for r in other["s"] for x in re.findall(r"[A-Za-z']+", r["en"])}
    return not (en & forms)


def distractor_count(target, pool, forms):
    """How many mutually compatible wrong options exist for `target`, up to three. A two-row
    word needs two-row options, or its own option would be the only two-row one."""
    matches = [lambda o: signature(o["s"]) == signature(target["s"])]
    if len(target["s"]) == 1:
        matches.append(lambda o: o["s"][0]["p"] == target["s"][0]["p"])
    picked = []
    for match in matches:
        picked = []
        for o in sorted(pool, key=lambda o: abs(o["r"] - target["r"])):
            if match(o) and can_distract(target, o, forms) and all(
                    not (meaning_chars(o["s"]) & meaning_chars(p["s"])) for p in picked):
                picked.append(o)
                if len(picked) == 3:
                    return 3
    return len(picked)


def apply_glosses(bands, glosses, lemma_to_forms):
    """Attach curated rows, drop words that fail, refill from spares, and fail loudly if a band
    cannot reach POOL_SIZE."""
    problems = []

    def add_spare(b, x):
        """Put the usable spare nearest in rank to the dropped word x into the pool."""
        if not b["spares"]:
            raise SystemExit(f"band {b['from']}-{b['to']} has no spare left for {x['w']}")
        spare = min(b["spares"], key=lambda s: abs(s["r"] - x["r"]))
        b["spares"].remove(spare)
        b["words"].append(spare)
        b["words"].sort(key=lambda s: s["r"])

    def curated(x):
        rows = glosses.get(x["w"])
        why = "no curated meanings" if rows is None else gloss_problem(
            rows, word_forms(x["w"], lemma_to_forms))
        if why:
            problems.append((x["w"], why))
            return None
        return {"w": x["w"], "r": x["r"], "s": rows}

    for b in bands:
        b["spares"] = [y for y in map(curated, b["spares"]) if y]
        words = [(x, curated(x)) for x in b["words"]]
        b["words"] = [y for _, y in words if y]
        for x in [x for x, y in words if not y]:
            add_spare(b, x)
    while True:
        pool = [x for b in bands for x in b["words"]]
        weak = [x for x in pool if distractor_count(x, pool, word_forms(x["w"], lemma_to_forms)) < 3]
        if not weak:
            break
        for x in weak:
            problems.append((x["w"], "fewer than three possible wrong options"))
            b = next(b for b in bands if x in b["words"])
            b["words"].remove(x)
            add_spare(b, x)
    for b in bands:
        if len(b["words"]) != POOL_SIZE:
            raise SystemExit(f"band {b['from']}-{b['to']} has {len(b['words'])} words")
        del b["spares"]
    return problems


# ---------- books ----------

# Letters of any script (accented letters count), joined by apostrophes inside a word.
TOKEN = re.compile(r"[^\W\d_]+(?:['\u2019][^\W\d_]+)*", re.UNICODE)
SUFFIXES = ("n't", "'s", "'ll", "'re", "'ve", "'d", "'m")
IRREGULAR = {"can't": "can", "won't": "will", "shan't": "shall", "ain't": "be", "let's": "let"}
# Tokens of 1-2 letters that are real words. Other short tokens are dialect or clipped
# fragments (th, em, de, st); they are ignored, so they are not in the token count.
SHORT_WORDS = {"a", "i", "an", "am", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is",
               "it", "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we"}


def clean_markdown(text):
    keep = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("#") or re.fullmatch(r"[\*\-_\s]{3,}", s) or "Project Gutenberg" in s:
            continue
        keep.append(line)
    text = "\n".join(keep)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[*_`>]+", " ", text)


def tokenize(text):
    """Yield (word, capitalised, sentence_initial) for each running word."""
    for m in TOKEN.finditer(text):
        raw = m.group(0).replace("\u2019", "'")
        cap = raw[0].isupper()
        before = text[max(0, m.start() - 12):m.start()].rstrip(" \t\n\r\"\u201c\u2018'(*_")
        initial = (not before) or before[-1] in ".!?:"
        low = raw.lower()
        if low in IRREGULAR:
            yield IRREGULAR[low], cap, initial
            continue
        for suf in SUFFIXES:
            if low.endswith(suf) and len(low) > len(suf):
                low = low[:-len(suf)]
                break
        for part in low.split("'"):
            if part and (len(part) > 2 or part in SHORT_WORDS or not part.isascii()):
                yield part, cap, initial


def to_lemma(word, ranking, form_to_lemmas):
    lemmas = form_to_lemmas.get(word)
    if not lemmas:
        return word
    options = [l for l in lemmas if l in ranking]
    return min(options, key=ranking.get) if options else sorted(lemmas)[0]


def book_ranks(slug, manifest, ranking, form_to_lemmas, known_extra):
    """Lemma rank of every running word of a book; 0 = known (name, foreign), inf = not in the list."""
    text = "\n".join(clean_markdown((LIBRARY / slug / les["file"]).read_text(encoding="utf-8"))
                     for les in manifest["lessons"])
    toks = list(tokenize(text))
    cap_mid, all_mid = Counter(), Counter()
    for w, cap, initial in toks:
        if not initial:
            all_mid[w] += 1
            cap_mid[w] += cap
    ranks = []
    for w, cap, initial in toks:
        lemma = to_lemma(w, ranking, form_to_lemmas)
        in_vocab = lemma in ranking
        mostly_cap = all_mid[w] > 0 and cap_mid[w] / all_mid[w] > 0.9
        if not w.isascii():
            ranks.append(0)  # accented letters: a foreign word or a name
        elif lemma in known_extra or w in known_extra:
            ranks.append(0)
        elif cap and not initial and not in_vocab and w not in form_to_lemmas:
            ranks.append(0)  # proper noun (a capital at sentence start proves nothing)
        elif mostly_cap and (all_mid[w] >= 2 or not in_vocab):
            ranks.append(0)  # almost always capitalised mid-sentence: a name
        elif in_vocab:
            ranks.append(ranking[lemma])
        else:
            ranks.append(math.inf)
    ranks.sort()
    return ranks


def book_needs(ranks):
    n = len(ranks)

    def need(p, rounding):
        r = ranks[math.ceil(p * n) - 1]
        if r > 20000:
            return None
        return max(rounding, int(round(r / rounding)) * rounding)

    def coverage(limit):
        return round(bisect_right(ranks, limit) / n, 3)
    return {"n95": need(0.95, 100), "n98": need(0.98, 100),
            "cov": [coverage((i + 1) * 1000) for i in range(14)]}, n


def spearman(xs, ys):
    def avg_ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(v):
            j = i
            while j + 1 < len(v) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return r
    rx, ry = avg_ranks(xs), avg_ranks(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    cov = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    return cov / math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))


def main():
    ap = argparse.ArgumentParser(description="Build vocab-test.json and vocab-needs.json")
    ap.add_argument("--dict", required=True, help="path to dictionary-en.db")
    ap.add_argument("--draft", help="write pool and spare words with dictionary meanings to this "
                    "file for curation, then stop")
    args = ap.parse_args()

    entries, form_to_lemmas, lemma_to_forms, senses, meta = load_dictionary(args.dict)
    promoted = fix_inflections(form_to_lemmas, lemma_to_forms, senses)
    print(f"words promoted to own lemma: {len(promoted)}")
    ranking, excluded = build_ranking(entries, form_to_lemmas, lemma_to_forms, senses)
    print(f"lemmas ranked: {len(ranking)}")
    print("excluded:", {k: len(v) for k, v in excluded.items()})

    bands = build_bands(ranking, senses, meta, set(entries))
    if args.draft:
        draft = {}
        for i, b in enumerate(bands):
            for role in ("words", "spares"):
                for x in b[role]:
                    draft[x["w"]] = {"band": i, "rank": x["r"], "role": "pool" if role == "words" else "spare",
                                     "hint": x["zh"], "rows": draft_rows(senses[x["w"]])}
        Path(args.draft).write_text(json.dumps(draft, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"draft: {len(draft)} words -> {args.draft}")
        return

    glosses = json.loads(GLOSSES.read_text(encoding="utf-8"))
    problems = apply_glosses(bands, glosses, lemma_to_forms)
    print(f"\nReplaced or skipped {len(problems)} words:")
    for w, why in problems:
        print(f"  {w}: {why}")
    OUT_TEST.write_text(json.dumps(
        {"version": 3, "bands": bands, "source": SOURCE},
        indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    print("\nSample words per band")
    srng = random.Random(7)
    for b in bands:
        ws = srng.sample(b["words"], min(8, len(b["words"])))
        print(f"  {b['from']}-{b['to']}: " + ", ".join(
            f"{x['w']} " + "/".join(r["p"] + "".join(r["zh"][:1]) for r in x["s"]) for x in ws))

    known_extra = KNOWN_ALWAYS | excluded["name"] | excluded["offensive"] | excluded["abbr"] | excluded["interjection"]
    levels = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}
    needs, rows = {}, []
    for mpath in sorted(LIBRARY.glob("*/manifest.json")):
        slug = mpath.parent.name
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
        res, n = book_needs(book_ranks(slug, manifest, ranking, form_to_lemmas, known_extra))
        needs[slug] = res
        rows.append((slug, manifest.get("level", "?"), res, n))
    OUT_NEEDS.write_text(json.dumps(needs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def show(v):
        return "-" if v is None else str(v)
    print(f"\n{'slug':48} {'lvl':4} {'n95':>6} {'n98':>6} {'c2k':>6} {'c4k':>6} {'c6k':>6} {'tokens':>8}")
    for slug, lvl, r, n in sorted(rows, key=lambda r: (r[2]["n95"] or 99999, r[2]["n98"] or 99999, r[0])):
        c = r["cov"]
        print(f"{slug:48} {lvl:4} {show(r['n95']):>6} {show(r['n98']):>6} "
              f"{c[1]:>6.3f} {c[3]:>6.3f} {c[5]:>6.3f} {n:>8}")
    pairs = [(levels[lvl], r["n95"] or 20001, r["n98"] or 20001)
             for _, lvl, r, _ in rows if lvl in levels]
    for i, name in ((1, "n95"), (2, "n98")):
        rho = spearman([p[0] for p in pairs], [p[i] for p in pairs])
        print(f"Spearman(level, {name}) = {rho:.3f} over {len(pairs)} books")

if __name__ == "__main__":
    main()
