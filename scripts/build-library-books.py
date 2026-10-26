#!/usr/bin/env python3
"""Turn Project Gutenberg plain-text files into library book packs.

Usage:
  python3 -I scripts/build-library-books.py --lang fr --raw <dir with pg<ID>.txt> --out languages/fr/content/library

Each book becomes <out>/<slug>/manifest.json plus NN.md lesson files of about
LESSON_WORDS words, cut at paragraph boundaries. The raw files are never committed.
"""
import argparse
import json
import re
import shutil
import unicodedata
from pathlib import Path

LESSON_WORDS = 1400

TITLE_SMALL_WORDS = {
    "a", "an", "the", "of", "in", "on", "at", "to", "and", "or", "for", "with", "from", "by",
    "de", "du", "des", "la", "le", "les", "un", "une", "au", "aux", "et", "à", "en", "sur", "dans",
}


def title_case(text: str) -> str:
    """Capitalise an all-caps title, keeping short function words in lower case."""
    out = []
    for n, word in enumerate(text.split()):
        low = word.lower()
        if n and low.strip(".,;:!?") in TITLE_SMALL_WORDS:
            out.append(low)
            continue
        m = re.match(r"^([dlqDLQ]['’])(.+)$", word)
        prefix, rest = (m[1].lower(), m[2]) if m else ("", word)
        i = next((k for k, ch in enumerate(rest) if ch.isalpha()), None)
        out.append(prefix + (rest if i is None else rest[:i] + rest[i].upper() + rest[i + 1:].lower()))
    return " ".join(out)


def sentence_case(text: str, names: tuple = ()) -> str:
    """Lower-case an all-caps title after its first letter, then restore the listed proper names."""
    out = text.rstrip(".").lower()
    out = out[:1].upper() + out[1:]
    out = re.sub(r"(?<=\. )[a-zà-ÿ]", lambda m: m[0].upper(), out)
    for name in names:
        out = re.sub(rf"(?<!\w){re.escape(name)}(?!\w)", name, out, flags=re.I)
    return out


POIL_DE_CAROTTE_TITLES = [re.escape(t) for t in (
    "Les Poules", "Les Perdrix", "C'est le chien", "Le Cauchemar", "Sauf votre respect", "Le Pot",
    "Les Lapins", "La Pioche", "La Carabine", "La Taupe", "La Luzerne", "Le Timbale", "La Mie de pain",
    "Le Trompette", "Ma Mèche", "Le Bain", "Honorine", "La Marmite", "Réticence", "Agathe",
    "Le Programme", "L'Aveugle", "Le Jour de l'An", "Aller et retour", "Le Porte-plume",
    "Les Joues rouges", "Les Poux", "Comme Brutus", "Le Toiton", "Le Chat", "Les Moutons", "Parrain",
    "La Fontaine", "Les Prunes", "Mathilde", "Le Coffre-fort", "Les Têtards", "Coup de théâtre",
    "En Chasse", "La Mouche", "La Première Bécasse", "L'Hameçon", "La Pièce d'argent",
    "Les Idées personnelles", "Lettres choisies", "La Tempête de feuilles", "La Révolte", "Le Mot de la fin",
    "L'Album de Poil de Carotte",
)]

ES_OLD_ACCENTS = [(r"\bá\b", "a"), (r"\bÁ\b", "A"), (r"\bó\b", "o"), (r"\bÓ\b", "O")]
ES_PLATES = [(r"\[(Ilustración|imagen)[^\]]*\]", ""), (r"^\s*\*(\s+\*)+\s*$", "")]

# Script exercises keep their text; word lists, letter drills and slate headings go.
MCGUFFEY_SUBS = [
    (r"\[Illustration: Script Exercise:([^\]]*)\]", r"\1"), (r"^SLATE WORK\.?[ \t]*$", ""),
    (r"^Slate Work[ \t]*$", ""), (r"^(\d+,\d+\.|[a-z])[ \t]*$", ""),
    (r"^[^.?!\"“\n]*\S {2,}[^.?!\"“\n]*$", ""), (r"^ *\d+ +ECLECTIC SERIES\.?[ \t]*$", ""),
    (r"\[Footnote:[^\]]*\]", ""),
]

# A Ségur speaker line ("M. ABEL." alone before the reply) joins the reply as "Abel : ...".
SEGUR_SPEAKERS = (r"^((?:M\. |MME |Mme )?[A-ZÀ-Ý][A-ZÀ-Ý' -]{1,})\.[ \t]*\n\s*\n", lambda m: title_case(m[1]) + " : ")
# A numbered chapter line followed by its title: "XXXII", blank, "Réveil." -> "Chapitre XXXII. Réveil."
FR_TITLED = (r"^([IVXLC]+)\.?[ \t]*\n(?:[ \t]*\n)*([^\n]{1,80}?)\.?[ \t]*$",
             lambda m: f"{'CHAPITRE' if m[2].isupper() else 'Chapitre'} {m[1]}. {m[2]}")
ROMAN_DOT_TITLE = (r"^([IVXLC]+)\. ([^\n]{2,80})$", lambda m: f"Chapitre {m[1]}. {m[2]}")
FR_CHAPITRE_TITLE = (r"^CHAPITRE (PREMIER|[IVXLC]+)\.?[ \t]*\n(?:[ \t]*\n)*(\S.*)$",
                     lambda m: f"{'CHAPITRE' if m[2].isupper() else 'Chapitre'} {'I' if m[1] == 'PREMIER' else m[1]}. {m[2]}")
# Speaker lines without a dot, before a "--" reply.
SEGUR_SPEAKERS_DASH = (r"^([A-ZÀ-Ý][A-ZÀ-Ý' .-]{1,}?)\.?[ \t]*\n\s*\n(?=--)", lambda m: title_case(m[1]) + " : ")
VOLTAIRE_NOTES = (r"^ +\[\d+\][^\n]*(?:\n {2,}\S[^\n]*)*", "")
VOLTAIRE_CHAPTER = (r"^CHAPITRE (\d+|[IVXLC]+)(?:\[\d+\])?\.[ \t]*\n(?:[ \t]*\n)*([^\n]+)$",
                    lambda m: f"Chapitre {m[1]}\n\n_{m[2].strip()}_")

BOOKS = [
    dict(lang="fr", slug="le-premier-livre", id=48011, title="Le Premier Livre (histoire de Remi)",
         author="Albert A. Méras et B. Méras", level="A1", start="", short="Remi",
         extractor="premier_livre", capitalise_headings=True, lesson_words=450),
    dict(lang="fr", slug="entre-nous", id=44157, title="Entre Nous : lectures françaises (première partie)",
         author="Lucie Vos, Jan Ligthart et H. Scheepstra", level="A1", start=r"^II\. Papa se fâche\.",
         short="Entre Nous", stop=r"^\s*LUCIE VOS,\s*$", lesson_words=600,
         subs=[(r"^[ \t]*(\[Musique\]|_\d+e couplet\._|_Refrain\._)[ \t]*$", ""),
               (r"[ \t]*(\}([ \t]*_bis_\.)?|\(_bis_\))", ""),
               (r"^([IVXL]+)\. (.+?)\.?[ \t]*$", lambda m: m[2].upper()),
               (r"^[ \t]*([A-ZÀ-Ý][A-ZÀ-Ý' ,!-]+)\.[ \t]*$", r"\1")]),
    dict(lang="fr", slug="contes-et-legendes", id=18873, title="Contes et légendes (première partie)",
         author="H. A. Guerber", level="A1", start=r"^LES TROIS OURS\.\[1\]", short="Contes et légendes",
         stop=r"^LE POISSON D'OR\.\[13\]",
         subs=[(r"(?s)^\[Note \d+:.*?\][ \t]*$", ""), (r"^([A-ZÀ-Ý' ,-]+)\.\[\d+\][ \t]*$", r"\1")]),
    dict(lang="fr", slug="riquet-a-la-houppe", id=17098, title="Riquet à la Houppe", author="Charles Perrault",
         level="A2", start=r"Il était une fois", short="Riquet à la Houppe",
         cut=r"^Paris\.--Imprimerie"),
    dict(lang="fr", slug="les-malheurs-de-sophie", id=15058, title="Les Malheurs de Sophie",
         author="Comtesse de Ségur", level="A2", start=r"^I--La poupée de cire\.\s*\n\s*\nMa bonne",
         short="Les Malheurs de Sophie",
         subs=[(r"^([IVX]+)--(.+?)\.?[ \t]*$", lambda m: m[2].upper())]),
    dict(lang="fr", slug="abc-petits-contes", id=30117, title="ABC : petits contes", author="Jules Lemaître",
         level="A2", start=r"^ANE\s*$", short="ABC", cut=r"^40840\.--TOURS"),
    dict(lang="fr", slug="lettres-de-mon-moulin", id=36780, title="Lettres de mon moulin", author="Alphonse Daudet",
         level="B1", start=r"^INSTALLATION\s*$", short="Lettres de mon moulin",
         cut=r"^\s*FIN\s*$"),
    dict(lang="fr", slug="le-tour-du-monde-en-80-jours", id=800, title="Le Tour du monde en quatre-vingts jours",
         author="Jules Verne", level="B1", start=r"En l'année 1872", short="Le Tour du monde"),
    dict(lang="fr", slug="les-memoires-d-un-ane", id=12783, title="Les Mémoires d'un âne",
         author="Comtesse de Ségur", level="B1", start=r"^I\s*\n\s*\nLE MARCHE", short="Mémoires d'un âne",
         subs=[(r"^[IVXL]+[ \t]*$", "")]),
    dict(lang="fr", slug="boule-de-suif", id=10746, title="Boule de Suif et autres contes", author="Guy de Maupassant",
         level="B2", start=r"Pendant plusieurs jours de suite", short="Boule de Suif",
         cut=r"^\s*(Table|TABLE)\s*$"),
    dict(lang="fr", slug="candide", id=4650, title="Candide, ou l'optimisme", author="Voltaire",
         level="B2", start=r"Il y avait en Vestphalie", short="Candide"),
    dict(lang="fr", slug="fables-de-la-fontaine", id=56327, title="Fables de La Fontaine",
         author="Jean de La Fontaine", level="B2", start=r"LA CIGALE ET LA FOURMI", short="Fables",
         cut=r"^\s*TABLE DES FABLES", verse=True,
         heading_names=["M.", "La Rochefoucauld", "Monseigneur le Dauphin", "Madame de Montespan",
                        "Madame de La Sablière", "Mademoiselle de Sillery", "Monseigneur le duc de Bourgogne",
                        "Monsieur de Barillon", "Monsieur de Harlay", "Jupiter", "Ésope", "Mercure", "Phébus",
                        "Borée", "Simonide", "Socrate", "Démocrite", "Abdéritains", "Hercule", "Bacchus",
                        "Vénus", "Philomèle", "Progné", "Daphnis", "Alcimadure", "Tircis", "Amarante", "Garo",
                        "Mogol", "Rodilardus", "Pilpay", "Bertrand", "Raton", "Pan", "Cupidon"]),
    dict(lang="fr", slug="trois-contes", id=12065, title="Trois contes", author="Gustave Flaubert",
         level="C1", start=r"Pendant un demi-siècle", short="Trois contes"),
    dict(lang="fr", slug="madame-bovary", id=14155, title="Madame Bovary", author="Gustave Flaubert",
         level="C1", start=r"^PREMIÈRE PARTIE\s*$", short="Madame Bovary"),
    dict(lang="fr", slug="germinal", id=5711, title="Germinal", author="Émile Zola",
         level="C1", start=r"^Première Partie\s*$", short="Germinal",
         subs=[(r"^(Première|Deuxième|Troisième) Partie[ \t]*$", lambda m: m[0].upper())]),
    dict(lang="fr", slug="du-cote-de-chez-swann", id=2650, title="Du côté de chez Swann",
         author="Marcel Proust", level="C2", start=r"^PREMIÈRE PARTIE\s*\nCOMBRAY", short="Du côté de chez Swann",
         heading_names=["Swann", "Combray"],
         subs=[(r"^(PREMIÈRE|DEUXIÈME|TROISIÈME) PARTIE[ \t]*\n(\S.*)$", r"\1 PARTIE: \2"),
               (r"^  («?)([A-ZÀ-Ý][A-ZÀ-Ý ,.'’!?«»-]+)$", lambda m: m[1] + _sentence(m[2]))]),
    dict(lang="fr", slug="le-pere-goriot", id=55860, title="Le Père Goriot", author="Honoré de Balzac",
         level="C2", start=r"^Madame Vauquer, née de Conflans", short="Le Père Goriot", stop=r"^FIN DU NEUVIÈME VOLUME",
         subs=[(r"(?s)\[Illustration:.*?\]", "")]),
    dict(lang="fr", slug="notre-dame-de-paris", id=19657, title="Notre-Dame de Paris", author="Victor Hugo",
         level="C2", start=r"^LIVRE PREMIER\s*$", short="Notre-Dame de Paris", cut=r"^NOTES\s*$",
         heading_names=["Pierre Gringoire", "Gringoire", "Jacques Coppenole", "Louis de France", "Chateaupers",
                        "Esmeralda", "Charybde", "Scylla", "Phoebus", "Quasimodo", "Grève", "Notre-Dame", "Paris",
                        "Claude Frollo", "Dante", "Bernardins", "Porte-Rouge", "Anankê"]),
    dict(lang="fr", slug="poil-de-carotte", id=4559, title="Poil de Carotte", author="Jules Renard",
         level="A2", start=r"^Les Poules\s*$", short="Poil de Carotte", cut=r"^TABLE\s*$",
         heading_names=["Brutus", "Poil de Carotte", "Lepic"],
         subs=[(r"^(?i:(" + "|".join(POIL_DE_CAROTTE_TITLES) + r"))\.?[ \t]*$", lambda m: m[1].upper())]),
    dict(lang="fr", slug="contes-choisis-grimm", id=12250, title="Contes choisis de la famille",
         author="Frères Grimm, traduit de l'allemand", level="A2", start=r"^LE LOUP ET L'HOMME\.",
         short="Contes de Grimm", cut=r"^TABLE\s*$", heading_names=[]),
    dict(lang="fr", slug="les-petites-filles-modeles", id=35404, title="Les Petites Filles modèles",
         author="Comtesse de Ségur", level="B1", start=r"^I\s*\n\s*\nCAMILLE ET MADELEINE",
         short="Les Petites Filles modèles", cut=r"^FIN\.\s*$",
         heading_names=["Camille", "Madeleine", "Marguerite", "Jeannette", "Sophie", "Françoise", "Lucie", "Hurel"],
         subs=[(r"^([A-ZÀ-Ý][A-ZÀ-Ý' -]{2,})\.[ \t]*\n\s*\n", lambda m: title_case(m[1]) + " : ")]),
    dict(lang="fr", slug="un-bon-petit-diable", id=12993, title="Un bon petit diable", author="Comtesse de Ségur",
         level="B1", start=r"^I\s*\n\s*\nLES FÉES", short="Un bon petit diable",
         heading_names=["Charles", "Juliette", "Mac'Miche", "Marianne", "Charybde", "Scylla", "Madame"],
         subs=[(r"(?s)\[Note \d+:.*?\]", "")]),
    dict(lang="fr", slug="le-petit-chose", id=13256, title="Le Petit Chose", author="Alphonse Daudet",
         level="B1", start=r"^I\s*\n\s*\nLA FABRIQUE", short="Le Petit Chose", cut=r"^TABLE\s*$",
         heading_names=["Boucoyran", "Viot", "M."],
         subs=[(r"(?s)\[Footnote \d+:.*?\]", ""),
               (r"^(PREMIÈRE|DEUXIÈME) PARTIE[ \t]*$", lambda m: m[0].capitalize()),
               (r"^«([A-ZÀ-Ý .'-]+?)\.?»[ \t]*$", lambda m: "«" + title_case(m[1]) + ".»")]),
    dict(lang="fr", slug="alice-au-pays-des-merveilles", id=55456, title="Aventures d'Alice au pays des merveilles",
         author="Lewis Carroll, traduit par Henri Bué", level="B1", start=r"^CHAPITRE PREMIER\.\s*$",
         short="Alice au pays des merveilles", cut=r"^FIN\.\s*$",
         subs=[(r"^CHAPITRE (\S+?)\.[ \t]*\n\s*\n([^\n]+)$",
                lambda m: f"Chapitre {'I' if m[1] == 'PREMIER' else m[1]}. {sentence_case(m[2], ('Alice',))}")]),
    dict(lang="en", slug="the-velveteen-rabbit", id=11757, title="The Velveteen Rabbit", author="Margery Williams",
         level="A2", start=r"^HERE was once a velveteen rabbit", short="The Velveteen Rabbit",
         subs=[(r"^HERE was once", "There was once"), (r"^ {10,}\S.*$", "")]),
    dict(lang="en", slug="english-fairy-tales", id=7439, title="English Fairy Tales", author="Joseph Jacobs (collector)",
         level="A2", start=r"^TOM TIT TOT\s*$", short="English Fairy Tales", stop=r"^OYEZ-OYEZ-OYEZ\s*$",
         title_headings=True,
         subs=[(r"^BE BOLD, BE BOLD[^\n]*(\n(?!\n)[^\n]+)?$",
                lambda m: sentence_case(" ".join(m[0].split())) + "."),
               (r"^(“NIMMY NIMMY NOT[^\n]*|“THOU HAST IT!”)[ \t]*$", lambda m: title_case(m[1]))]),
    dict(lang="en", slug="stories-from-hans-andersen", id=17860, title="Stories from Hans Andersen",
         author="Hans Christian Andersen, illustrated by Edmund Dulac", level="B1", start=r"^THE SNOW QUEEN\s*$",
         short="Hans Andersen", title_headings=True,
         cut=r"^Printed in Great Britain"),
    dict(lang="en", slug="the-secret-garden", id=113, title="The Secret Garden", author="Frances Hodgson Burnett",
         level="B1", start=r"^CHAPTER I\.\s*\nTHERE IS NO ONE LEFT", short="The Secret Garden",
         cut=r"^THE END\s*$",
         subs=[(r"^CHAPTER ([IVXL]+)\.?[ \t]*\n(\S.*(?:\n\S.*)*)",
                lambda m: f"Chapter {m[1]}. " + title_case(" ".join(m[2].split())))]),
    dict(lang="en", slug="just-so-stories", id=2781, title="Just So Stories", author="Rudyard Kipling",
         level="B1", start=r"^HOW THE WHALE GOT HIS THROAT\s*\n\s*\nIN the sea", short="Just So Stories",
         title_headings=True, verse="auto"),
    dict(lang="en", slug="a-little-princess", id=146, title="A Little Princess", author="Frances Hodgson Burnett",
         level="B1", start=r"^1\s*\n\s*\nSara\s*\n", short="A Little Princess",
         subs=[(r"^(\d{1,2})[ \t]*\n\s*\n([^\n]+)$", lambda m: f"Chapter {m[1]}. {m[2]}"),
               (r"^MISS MINCHIN,[ \t]*$", "Miss Minchin,")]),
    dict(lang="en", slug="kittens-and-cats", id=61852, title="Kittens and Cats: A First Reader",
         author="Eulalie Osgood Grover", level="A1", start=r"^THE QUEEN\s*$", short="Kittens and Cats",
         cut=r"^A WORD TO THE TEACHER", capitalise_headings=True),
    dict(lang="en", slug="heart-of-darkness", id=219, title="Heart of Darkness",
         author="Joseph Conrad", level="C2", start=r"^I\s*\n\s*\nThe Nellie", short="Heart of Darkness"),
    dict(lang="en", slug="the-tale-of-peter-rabbit", id=14838, title="The Tale of Peter Rabbit",
         author="Beatrix Potter", level="A2", start=r"Once upon a time", short="Peter Rabbit"),
    dict(lang="en", slug="aesops-fables", id=11339, title="Aesop's Fables",
         author="Aesop, translated by V. S. Vernon Jones", level="A2",
         start=r"^THE FOX AND THE GRAPES\s*\n\s*\nA hungry Fox", short="Aesop's Fables", stop=r"^ILLUSTRATIONS\s*$",
         title_headings=True),
    dict(lang="en", slug="the-wonderful-wizard-of-oz", id=55, title="The Wonderful Wizard of Oz",
         author="L. Frank Baum", level="B1", start=r"Dorothy lived in the midst", short="The Wizard of Oz"),
    dict(lang="en", slug="alices-adventures-in-wonderland", id=11, title="Alice's Adventures in Wonderland",
         author="Lewis Carroll", level="B1", start=r"Alice was beginning to get very tired", short="Alice in Wonderland"),
    dict(lang="en", slug="adventures-of-sherlock-holmes", id=1661, title="The Adventures of Sherlock Holmes",
         author="Arthur Conan Doyle", level="B2", start=r"To Sherlock Holmes she is always", short="Sherlock Holmes"),
    dict(lang="en", slug="pride-and-prejudice", id=1342, title="Pride and Prejudice",
         author="Jane Austen", level="C1", start=r"It is a truth universally acknowledged", short="Pride and Prejudice",
         cut=r"^\s*\[Illustration:\s*$"),
    dict(lang="en", slug="the-summers-primer", id=68453, title="The Summers Readers: Primer",
         author="Maud Summers", level="A1", start=r"^\s*Sing\.\s*$", short="Primer",
         cut=r"^REFERENCES TO THE MANUAL", capitalise_headings=True),
    dict(lang="en", slug="the-summers-first-reader", id=67302, title="The Summers Readers: First Reader",
         author="Maud Summers", level="A1", start=r"^\[Illustration\] THE LITTLE RED APPLE", short="First Reader",
         cut=r"^ALPHABET\.\s*$", capitalise_headings=True,
         subs=[(r"=([^=\n]+)=", r"\1"), (r"^[IVX]+[ \t]*$", "")]),
    dict(lang="en", slug="the-little-red-hen", id=18735, title="The Little Red Hen",
         author="Florence White Williams", level="A2", start=r"^A Little Red Hen lived in a barnyard",
         short="The Little Red Hen", cut=r"^\s*\*\s+\*\s+\*"),
    dict(lang="en", slug="the-happy-prince", id=30120, title="The Happy Prince and Other Tales",
         author="Oscar Wilde", level="B1", start=r"^THE HAPPY PRINCE\s*\n\s*\nHigh above the city",
         short="The Happy Prince", cut=r"^PRINTED BY\s*$", capitalise_headings=True),
    dict(lang="en", slug="black-beauty", id=271, title="Black Beauty",
         author="Anna Sewell", level="B1", start=r"^Part I\s*$", short="Black Beauty",
         subs=[(r"^(\d\d) (.+?)[ \t]*$", lambda m: f"Chapter {int(m[1])}. {m[2]}")]),
    dict(lang="en", slug="treasure-island", id=120, title="Treasure Island",
         author="Robert Louis Stevenson", level="B2", start=r"^PART ONE--The Old Buccaneer", short="Treasure Island",
         subs=[(r"^([IVXL]+)[ \t]*\n(\S.*(?:\n\S.*)*)", lambda m: f"Chapter {m[1]}. " + " ".join(m[2].split()))]),
    dict(lang="en", slug="the-call-of-the-wild", id=215, title="The Call of the Wild",
         author="Jack London", level="B2", start=r"^Chapter I\. Into the Primitive", short="The Call of the Wild"),
    dict(lang="en", slug="a-christmas-carol", id=46, title="A Christmas Carol",
         author="Charles Dickens", level="C1", start=r"^STAVE I:", short="A Christmas Carol"),
    dict(lang="en", slug="the-picture-of-dorian-gray", id=174, title="The Picture of Dorian Gray",
         author="Oscar Wilde", level="C1", start=r"^CHAPTER I\.\s*$", short="Dorian Gray",
         subs=[(r"^CHAPTER ([IVXL]+)\.[ \t]*$", r"Chapter \1.")]),
    dict(lang="en", slug="jane-eyre", id=1260, title="Jane Eyre",
         author="Charlotte Brontë", level="C1", start=r"^CHAPTER I\s*$", short="Jane Eyre",
         subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="great-expectations", id=1400, title="Great Expectations",
         author="Charles Dickens", level="C2", start=r"^Chapter I\.\s*$", short="Great Expectations",
         subs=[(r"^THIS IS THE END OF THE (\w+) STAGE OF PIP’S EXPECTATIONS\.",
                lambda m: f"This is the end of the {m[1].lower()} stage of Pip’s expectations.")]),
    dict(lang="en", slug="wuthering-heights", id=768, title="Wuthering Heights",
         author="Emily Brontë", level="C2", start=r"^CHAPTER I\s*$", short="Wuthering Heights",
         subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="mcguffeys-first-reader", id=14640, title="McGuffey's First Eclectic Reader",
         author="William Holmes McGuffey", level="A1", start=r"^LESSON I\.\s*$", short="First Reader",
         cut=r"^PHONIC CHART", capitalise_headings=True, verse="auto", subs=MCGUFFEY_SUBS),
    dict(lang="en", slug="the-tale-of-benjamin-bunny", id=14407, title="The Tale of Benjamin Bunny",
         author="Beatrix Potter", level="A2", start=r"^One morning a little rabbit sat on a bank",
         short="Benjamin Bunny", cut=r"^THE END\s*$"),
    dict(lang="en", slug="the-tale-of-jemima-puddle-duck", id=14814, title="The Tale of Jemima Puddle-Duck",
         author="Beatrix Potter", level="A2", start=r"^What a funny sight it is", short="Jemima Puddle-Duck"),
    dict(lang="en", slug="peter-pan", id=16, title="Peter Pan", author="J. M. Barrie", level="B1",
         start=r"^Chapter I\.\s*\nPETER BREAKS THROUGH", short="Peter Pan", cut=r"^THE END\s*$",
         subs=[(r"^Chapter ([IVXL]+)\.[ \t]*\n(\S.*)$", lambda m: f"Chapter {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="the-adventures-of-pinocchio", id=500, title="The Adventures of Pinocchio",
         author="Carlo Collodi, translated by Carol Della Chiesa", level="B1", start=r"^CHAPTER 1\s*$",
         short="Pinocchio",
         subs=[(r"^CHAPTER (\d+)[ \t]*$", r"Chapter \1"),
               (r"^ {5}GREAT SPECTACLE TONIGHT\n(?:.*\n)*? {5}The Theater will be as Light as Day",
                lambda m: "\n".join(ln.strip() for ln in m[0].splitlines() if ln.strip(" -")))]),
    dict(lang="en", slug="anne-of-green-gables", id=45, title="Anne of Green Gables",
         author="L. M. Montgomery", level="B2", start=r"^CHAPTER I\. Mrs\. Rachel Lynde", short="Anne of Green Gables",
         subs=[(r"^CHAPTER ([IVXL]+)\.", r"Chapter \1."),
                                     (r"^(Chapter [IVXL]+\..*\n\s*\n)([A-Z])([A-Z]+)\b", lambda m: m[1] + m[2] + m[3].lower())]),
    dict(lang="en", slug="the-adventures-of-tom-sawyer", id=74, title="The Adventures of Tom Sawyer",
         author="Mark Twain", level="B2", start=r"^CHAPTER I\s*\n\s*\n\s*“Tom!”", short="Tom Sawyer",
         subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="the-time-machine", id=35, title="The Time Machine", author="H. G. Wells", level="B2",
         start=r"^ I\.\s*\n Introduction", short="The Time Machine",
         subs=[(r"^ ([IVX]+)\.[ \t]*\n (\S.*)$", r"Chapter \1. \2"), (r"^ Epilogue[ \t]*$", "EPILOGUE")]),
    dict(lang="en", slug="the-great-gatsby", id=64317, title="The Great Gatsby", author="F. Scott Fitzgerald",
         level="C1", start=r"^ {20,}I\s*\n\s*\nIn my younger", short="The Great Gatsby",
         subs=[(r"^ {20,}([IVX]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="dr-jekyll-and-mr-hyde", id=43, title="Strange Case of Dr Jekyll and Mr Hyde",
         author="Robert Louis Stevenson", level="C1", start=r"^STORY OF THE DOOR\s*\n\s*\nMr\. Utterson",
         short="Jekyll and Hyde", title_headings=True, subs=[(r"^HASTIE LANYON\.", "Hastie Lanyon.")]),
    dict(lang="en", slug="frankenstein", id=84, title="Frankenstein",
         author="Mary Shelley", level="C1", start=r"^Letter 1\s*$", short="Frankenstein",
         subs=[(r"^Letter (\d)[ \t]*$", r"LETTER \1"), (r"sister!\n\nR\.W\.$", "sister!\nR.W.")]),
    dict(lang="en", slug="walden", id=205, title="Walden", author="Henry David Thoreau",
         level="C2", start=r"^Economy\s*\n\s*\nWhen I wrote", short="Walden", stop=r"^ON THE DUTY OF CIVIL DISOBEDIENCE",
         title_headings=True,
         subs=[(r"^(Economy|Where I Lived, and What I Lived For|Reading|Sounds|Solitude|Visitors|The Bean-Field|"
                r"The Village|The Ponds|Baker Farm|Higher Laws|Brute Neighbors|House-Warming|"
                r"Former Inhabitants and Winter Visitors|Winter Animals|The Pond in Winter|Spring|Conclusion)[ \t]*$",
                lambda m: m[1].upper())]),
    dict(lang="en", slug="mcguffeys-eclectic-primer", id=14642, title="McGuffey's Eclectic Primer",
         author="William Holmes McGuffey", level="A1", start=r"^Lesson 1\s*$", short="Primer",
         cut=r"^SCRIPT ALPHABET", capitalise_headings=True, verse="auto", subs=MCGUFFEY_SUBS),
    dict(lang="en", slug="aldine-first-reader", id=65323, title="A First Reader",
         author="Frank E. Spaulding and Catherine T. Bryce", level="A1", start=r"^ +With·The·Birds\s*$",
         short="First Reader", cut=r"^ *VOCABULARY\s*$", title_headings=True, verse="auto",
         subs=[(r"^ +(\S+(?:·\S+)+)[ \t]*$", lambda m: m[1].replace("·", " ").upper()),
               (r"^ +[a-z()· -]+$", "")]),
    dict(lang="en", slug="aldine-second-reader", id=68545, title="A Second Reader",
         author="Frank E. Spaulding and Catherine T. Bryce", level="A1", start=r"^THE CAT AND THE BIRDS\s*$",
         short="Second Reader", cut=r"^Vocabulary\s*$", title_headings=True, verse="auto",
         subs=[(r"^ +[a-z()· -]+$", "")]),
    dict(lang="en", slug="mcguffeys-second-reader", id=14668, title="McGuffey's Second Eclectic Reader",
         author="William Holmes McGuffey", level="A2", start=r"^LESSON I\.\s*$", short="Second Reader",
         title_headings=True, verse="auto", subs=MCGUFFEY_SUBS),
    dict(lang="en", slug="fifty-famous-stories-retold", id=18442, title="Fifty Famous Stories Retold",
         author="James Baldwin", level="A2", start=r"^KING ALFRED AND THE CAKES\.", short="Fifty Famous Stories",
         cut=r"^\s*\*\s+\*\s+\*", title_headings=True),
    dict(lang="en", slug="the-tale-of-tom-kitten", id=14837, title="The Tale of Tom Kitten",
         author="Beatrix Potter", level="A2", start=r"^Once upon a time there were three little kittens",
         short="Tom Kitten"),
    dict(lang="en", slug="the-tale-of-squirrel-nutkin", id=14872, title="The Tale of Squirrel Nutkin",
         author="Beatrix Potter", level="A2", start=r"^This is a Tale about a tail", short="Squirrel Nutkin",
         cut=r"^THE END\s*$", verse="auto"),
    dict(lang="en", slug="heidi", id=1448, title="Heidi", author="Johanna Spyri, translated by Marion Edwards",
         level="B1", start=r"^CHAPTER I\. UP THE MOUNTAIN", short="Heidi", title_headings=True),
    dict(lang="en", slug="the-railway-children", id=1874, title="The Railway Children", author="E. Nesbit",
         level="B1", start=r"^Chapter I\. The beginning of things", short="The Railway Children"),
    dict(lang="en", slug="the-jungle-book", id=236, title="The Jungle Book", author="Rudyard Kipling",
         level="B1", start=r"^Mowgli’s Brothers\s*$", short="The Jungle Book", title_headings=True, verse="auto",
         subs=[(r"^“?(Mowgli’s Brothers|Hunting-Song of the Seeonee Pack|Kaa’s Hunting|Road-Song of the Bandar-Log|"
                r"Tiger! Tiger!|Mowgli’s Song|The White Seal|Lukannon|Rikki-Tikki-Tavi|Darzee’s Chant|"
                r"Toomai of the Elephants|Shiv and the Grasshopper|Her Majesty’s Servants|"
                r"Parade Song of the Camp Animals)”?[ \t]*$", lambda m: m[1].upper())]),
    dict(lang="en", slug="five-children-and-it", id=778, title="Five Children and It", author="E. Nesbit",
         level="B1", start=r"^CHAPTER 1\s*\nBEAUTIFUL AS THE DAY", short="Five Children and It",
         cut=r"^\*Project Gutenberg Etext",
         subs=[(r"^CHAPTER (\d+)[ \t]*\n(\S.*)$", lambda m: f"Chapter {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="the-wind-in-the-willows", id=289, title="The Wind in the Willows",
         author="Kenneth Grahame", level="B2", start=r"^I\.\s*\nTHE RIVER BANK", short="The Wind in the Willows",
         title_headings=True),
    dict(lang="en", slug="around-the-world-in-eighty-days", id=103, title="Around the World in Eighty Days",
         author="Jules Verne, translated by George M. Towle", level="B2", start=r"^CHAPTER I\.\s*\nIN WHICH PHILEAS",
         short="Around the World in Eighty Days",
         subs=[(r"^CHAPTER ([IVXL]+)\.[ \t]*\n(\S.*(?:\n\S.*)*)",
                lambda m: f"Chapter {m[1]}\n\n_" + title_case(" ".join(m[2].split())) + "_")]),
    dict(lang="en", slug="the-hound-of-the-baskervilles", id=2852, title="The Hound of the Baskervilles",
         author="Arthur Conan Doyle", level="B2", start=r"^Chapter 1\.\s*\nMr\. Sherlock Holmes",
         short="The Hound of the Baskervilles",
         subs=[(r"^Chapter (\d+)\.[ \t]*\n(\S.*)$", r"Chapter \1. \2")]),
    dict(lang="en", slug="the-war-of-the-worlds", id=36, title="The War of the Worlds", author="H. G. Wells",
         level="B2", start=r"^BOOK ONE\s*\nTHE COMING OF THE MARTIANS", short="The War of the Worlds",
         title_headings=True,
         subs=[(r"^BOOK (ONE|TWO)[ \t]*\n(\S.*)$", lambda m: f"Book {m[1].capitalize()}. " + title_case(m[2]))]),
    dict(lang="en", slug="emma", id=158, title="Emma", author="Jane Austen", level="C1",
         start=r"^VOLUME I\s*$", short="Emma", title_headings=True,
         subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1"), (r"^VOLUME ([IVX]+)[ \t]*$", r"Volume \1"),
               (r"^F\. C\. WESTON CHURCHILL\.", "F. C. Weston Churchill.")]),
    dict(lang="en", slug="dracula", id=345, title="Dracula", author="Bram Stoker", level="C1",
         start=r"^CHAPTER I\s*\n\s*\nJONATHAN HARKER", short="Dracula", title_headings=True,
         cut=r"^\s*THE END\s*$", subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1"), (r"_\{(\d+)\}", r"\1")]),
    dict(lang="en", slug="robinson-crusoe", id=521, title="Robinson Crusoe", author="Daniel Defoe", level="C1",
         start=r"^CHAPTER I\. START IN LIFE", short="Robinson Crusoe", title_headings=True),
    dict(lang="en", slug="a-tale-of-two-cities", id=98, title="A Tale of Two Cities", author="Charles Dickens",
         level="C1", start=r"^Book the First--Recalled to Life\s*(?:\n\s*)+CHAPTER I\.", short="A Tale of Two Cities",
         title_headings=True,
         subs=[(r"^CHAPTER ([IVXL]+)\.[ \t]*\n(\S.*)$", r"Chapter \1. \2")]),
    dict(lang="en", slug="moby-dick", id=2701, title="Moby-Dick; or, The Whale", author="Herman Melville",
         level="C2", start=r"^CHAPTER 1\. Loomings\.\s*\n\s*\nCall me Ishmael", short="Moby-Dick",
         subs=[(r"^CHAPTER (\d+)\.", r"Chapter \1.")]),
    dict(lang="en", slug="the-scarlet-letter", id=25344, title="The Scarlet Letter", author="Nathaniel Hawthorne",
         level="C2", start=r"^ +THE CUSTOM-HOUSE\.\s*\n\s*\n +INTRODUCTORY", short="The Scarlet Letter",
         cut=r"^\s*TRANSCRIBER’S NOTES", title_headings=True),
    dict(lang="en", slug="middlemarch", id=145, title="Middlemarch", author="George Eliot", level="C2",
         start=r"^PRELUDE\.\s*$", short="Middlemarch", title_headings=True, verse="auto",
         subs=[(r"^BOOK ([IVX]+)\.[ \t]*\n(\S.*)$", lambda m: f"Book {m[1]}. " + title_case(m[2])), (r"^CHAPTER ([IVXL]+)\.[ \t]*$", r"Chapter \1.")]),
    dict(lang="en", slug="the-tale-of-the-flopsy-bunnies", id=14220, title="The Tale of the Flopsy Bunnies",
         author="Beatrix Potter", level="A2", start=r"^It is said that the effect of eating too much lettuce",
         short="The Flopsy Bunnies", cut=r"^THE TALE OF THE FLOPSY BUNNIES"),
    dict(lang="en", slug="the-tale-of-mr-jeremy-fisher", id=15077, title="The Tale of Mr. Jeremy Fisher",
         author="Beatrix Potter", level="A2", start=r"^Once upon a time there was a frog", short="Mr. Jeremy Fisher",
         cut=r"^THE END\s*$"),
    dict(lang="en", slug="the-tale-of-mrs-tiggy-winkle", id=15137, title="The Tale of Mrs. Tiggy-Winkle",
         author="Beatrix Potter", level="A2", start=r"^Once upon a time there was a little girl called Lucie",
         short="Mrs. Tiggy-Winkle", cut=r"^THE END\s*$"),
    dict(lang="en", slug="the-tale-of-two-bad-mice", id=45264, title="The Tale of Two Bad Mice",
         author="Beatrix Potter", level="A2", start=r"^ONCE upon a time there was a very beautiful doll",
         short="Two Bad Mice", cut=r"^THE END\s*$", subs=[(r"^ONCE upon", "Once upon")]),
    dict(lang="en", slug="mcguffeys-third-reader", id=14766, title="McGuffey's Third Eclectic Reader",
         author="William Holmes McGuffey", level="A2", start=r"^LESSON I\.\s*$", short="Third Reader",
         title_headings=True, verse="auto",
         subs=MCGUFFEY_SUBS + [(r"(?i)^\s*\d+\s+Eclectic Series[.,]?[ \t]*$", ""), (r"(?i)^\s*Third Reader[.,]?\s+\d+[ \t]*$", "")]),
    dict(lang="en", slug="grimms-fairy-tales", id=2591, title="Grimms' Fairy Tales",
         author="Jacob and Wilhelm Grimm, translated by Edgar Taylor and Marian Edwardes", level="B1",
         start=r"^THE GOLDEN BIRD\s*$", short="Grimms' Fairy Tales", title_headings=True,
         cut=r"^\*\*\*\*\*\s*$"),
    dict(lang="en", slug="andersens-fairy-tales", id=1597, title="Andersen's Fairy Tales",
         author="Hans Christian Andersen", level="B1", start=r"^THE EMPEROR'S NEW CLOTHES\s*$",
         short="Andersen's Fairy Tales", title_headings=True),
    dict(lang="en", slug="the-arabian-nights", id=128, title="The Arabian Nights Entertainments",
         author="Andrew Lang (editor)", level="B1", start=r"^The Arabian Nights\s*\n\s*\nIn the chronicles",
         short="The Arabian Nights", title_headings=True,
         subs=[(r"^(The Story of the Three Calenders, Sons of Kings,)[ \t]*\n(and of Five Ladies of Bagdad)",
                lambda m: f"{m[1]} {m[2]}".upper()),
               (r"^(The Arabian Nights|The Story of [^\n]{3,70}|The Seven Voyages of Sindbad the Sailor|"
                r"(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh and Last) Voyage|The Little Hunchback|"
                r"The Adventures of [^\n]{3,70}|Noureddin and the Fair Persian|Aladdin and the Wonderful Lamp|"
                r"The Enchanted Horse)[ \t]*$", lambda m: m[1].upper())]),
    dict(lang="en", slug="tales-from-shakespeare", id=573, title="Tales from Shakespeare",
         author="Charles and Mary Lamb", level="B1", start=r"^THE TEMPEST\s*\n\s*\nThere was a certain island",
         short="Tales from Shakespeare", title_headings=True),
    dict(lang="en", slug="daddy-long-legs", id=157, title="Daddy-Long-Legs", author="Jean Webster", level="B1",
         start=r"^Blue Wednesday\s*$", short="Daddy-Long-Legs", title_headings=True,
         subs=[(r"^Blue Wednesday[ \t]*$", "BLUE WEDNESDAY")]),
    dict(lang="en", slug="little-lord-fauntleroy", id=479, title="Little Lord Fauntleroy",
         author="Frances Hodgson Burnett", level="B1", start=r"^I\s*\n\s*\nCedric himself", short="Little Lord Fauntleroy"),
    dict(lang="en", slug="the-prince-and-the-pauper", id=1837, title="The Prince and the Pauper", author="Mark Twain",
         level="B1", start=r"^CHAPTER I\. The birth of the Prince", short="The Prince and the Pauper",
         cut=r"^FOOTNOTES AND TWAIN", subs=[(r"^CHAPTER ([IVXL]+)\.", r"Chapter \1."), (r" ?\{\d+\}", "")]),
    dict(lang="en", slug="the-story-of-my-life", id=2397, title="The Story of My Life", author="Helen Keller",
         level="B1", start=r"^CHAPTER I\s*\n\s*\nIt is with a kind of fear", short="The Story of My Life",
         title_headings=True, subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="stray-birds", id=6524, title="Stray Birds", author="Rabindranath Tagore", level="B1",
         start=r"^1\s*\nStray birds of summer", short="Stray Birds", verse="auto", subs=[(r"^\d+[ \t]*$", "")]),
    dict(lang="en", slug="little-women", id=514, title="Little Women", author="Louisa May Alcott", level="B2",
         start=r"^PART 1\s*(?:\n\s*)+CHAPTER ONE", short="Little Women", title_headings=True,
         subs=[(r"^CHAPTER ([A-Z-]+)[ \t]*\n(\S.*)$", lambda m: f"Chapter {m[1].title()}. " + title_case(m[2]))]),
    dict(lang="en", slug="oliver-twist", id=730, title="Oliver Twist", author="Charles Dickens", level="B2",
         start=r"^ ?CHAPTER I\.\s*\nTREATS OF THE PLACE", short="Oliver Twist",
         subs=[(r"^ ?CHAPTER ([IVXL]+)\.?[ \t]*\n(\S.*(?:\n\S.*)*)",
                lambda m: f"Chapter {m[1]}\n\n_" + sentence_case(" ".join(m[2].split()), ("Oliver Twist", "Oliver",
                    "Mr. Bumble", "Bumble", "Fagin", "Sikes", "Nancy", "Noah Claypole", "Mr. Brownlow", "Brownlow",
                    "Rose", "Mrs. Maylie", "Monks", "Dodger", "Charley Bates", "London", "Mr. Sowerberry")) + "._")]),
    dict(lang="en", slug="white-fang", id=910, title="White Fang", author="Jack London", level="B2",
         start=r"^PART I\s*$", short="White Fang", title_headings=True,
         subs=[(r"^CHAPTER ([IVXL]+)[ \t]*\n(\S.*)$", lambda m: f"Chapter {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="the-invisible-man", id=5230, title="The Invisible Man", author="H. G. Wells", level="B2",
         start=r"^CHAPTER I\.\s*\nTHE STRANGE MAN", short="The Invisible Man", title_headings=True,
         subs=[(r"^CHAPTER ([IVXL]+)\.[ \t]*\n(\S.*)$", lambda m: f"Chapter {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="the-four-million", id=2776, title="The Four Million", author="O. Henry", level="B2",
         start=r"^TOBIN’S PALM\s*$", short="The Four Million", title_headings=True),
    dict(lang="en", slug="a-study-in-scarlet", id=244, title="A Study in Scarlet", author="Arthur Conan Doyle",
         level="B2", start=r"^ *CHAPTER I\.\s*\n *MR\. SHERLOCK HOLMES", short="A Study in Scarlet", title_headings=True,
         subs=[(r"^ *CHAPTER ([IVXL]+)\.[ \t]*\n *(\S.*)$", lambda m: f"Chapter {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="the-sign-of-the-four", id=2097, title="The Sign of the Four", author="Arthur Conan Doyle",
         level="B2", start=r"^Chapter I\s*\nThe Science of Deduction", short="The Sign of the Four",
         subs=[(r"^Chapter ([IVXL]+)[ \t]*\n(\S.*)$", r"Chapter \1. \2")]),
    dict(lang="en", slug="the-memoirs-of-sherlock-holmes", id=834, title="The Memoirs of Sherlock Holmes",
         author="Arthur Conan Doyle", level="B2", start=r"^I\. Silver Blaze\s*$", short="The Memoirs of Sherlock Holmes",
         title_headings=True, subs=[(r"(?:\A|(?<=\n\n))([IVX]+\. [A-Z][^\n]{2,60})(?=\n)", lambda m: m[1].upper())]),
    dict(lang="en", slug="the-return-of-sherlock-holmes", id=108, title="The Return of Sherlock Holmes",
         author="Arthur Conan Doyle", level="B2", start=r"^THE ADVENTURE OF THE EMPTY HOUSE\s*$",
         short="The Return of Sherlock Holmes", title_headings=True,
         subs=[(r"^ +([A-Z.]+(?:[- ]+[A-Z.]+)*)[ \t]*$", r"“\1”")]),
    dict(lang="en", slug="gitanjali", id=7164, title="Gitanjali", author="Rabindranath Tagore", level="B2",
         start=r"^1\.\s*\n\s*\nThou hast made me endless", short="Gitanjali", subs=[(r"^\d+\.[ \t]*$", "")]),
    dict(lang="en", slug="the-prophet", id=58585, title="The Prophet", author="Kahlil Gibran", level="B2",
         start=r"^THE PROPHET\s*\n\s*\nAlmustafa", short="The Prophet", verse="auto", title_headings=True),
    dict(lang="en", slug="sense-and-sensibility", id=161, title="Sense and Sensibility", author="Jane Austen",
         level="C1", start=r"^CHAPTER I\.\s*\n\s*\nThe family of Dashwood", short="Sense and Sensibility",
         subs=[(r"^CHAPTER ([IVXL]+)\.?[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="persuasion", id=105, title="Persuasion", author="Jane Austen", level="C1",
         start=r"^CHAPTER I\.\s*\n\s*\nSir Walter Elliot", short="Persuasion",
         subs=[(r"^CHAPTER ([IVXL]+)\.?[ \t]*$", r"Chapter \1"), (r"\n\s*\n(F\. W\.)[ \t]*$", r"\n\1")]),
    dict(lang="en", slug="david-copperfield", id=766, title="David Copperfield", author="Charles Dickens",
         level="C1", start=r"^CHAPTER 1\. I AM BORN", short="David Copperfield", title_headings=True,
         subs=[(r"^(CHAPTER \d+\..*)$", lambda m: m[1].upper())]),
    dict(lang="en", slug="gullivers-travels", id=829, title="Gulliver's Travels", author="Jonathan Swift",
         level="C1", start=r"^PART I\. A VOYAGE TO LILLIPUT", short="Gulliver's Travels", title_headings=True,
         cut=r"^Footnotes:", subs=[(r"^CHAPTER ([IVXL]+)\.?[ \t]*$", r"Chapter \1."),
                                   (r"AND\nJAPAN\.", "AND JAPAN."), (r"^PART ([IVX]+)\. (.*)$", lambda m: f"Part {m[1]}. " + title_case(m[2]))]),
    dict(lang="en", slug="autobiography-of-benjamin-franklin", id=20203, title="Autobiography of Benjamin Franklin",
         author="Benjamin Franklin", level="C1", start=r"^I\s*\n\s*\nANCESTRY AND EARLY YOUTH",
         short="Autobiography of Benjamin Franklin", title_headings=True,
         cut=r"^THE END\s*$", subs=[(r"\[Transcriber's note:[^\]]*\]", "")]),
    dict(lang="en", slug="martin-eden", id=1056, title="Martin Eden", author="Jack London", level="C1",
         start=r"^CHAPTER I\.\s*\n\s*\nThe one opened", short="Martin Eden",
         subs=[(r"^CHAPTER ([IVXL]+)\.?[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="the-moon-and-sixpence", id=222, title="The Moon and Sixpence", author="W. Somerset Maugham",
         level="C1", start=r"^Chapter I\s*\n\s*\nI confess", short="The Moon and Sixpence"),
    dict(lang="en", slug="crime-and-punishment", id=2554, title="Crime and Punishment",
         author="Fyodor Dostoevsky, translated by Constance Garnett", level="C1", start=r"^PART I\s*$",
         short="Crime and Punishment", title_headings=True, subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="anna-karenina", id=1399, title="Anna Karenina",
         author="Leo Tolstoy, translated by Constance Garnett", level="C1", start=r"^PART ONE\s*\n\s*\nChapter 1",
         short="Anna Karenina", title_headings=True),
    dict(lang="en", slug="vanity-fair", id=599, title="Vanity Fair", author="William Makepeace Thackeray",
         level="C2", start=r"^CHAPTER I\s*\n\s*\nChiswick Mall", short="Vanity Fair",
         subs=[(r"\[_Transcriber's Note:[^\]]*\]", ""), (r"^CHAPTER ([IVXL]+)[ \t]*\n(?:[ \t]*\n)*(\S.*)$", r"Chapter \1. \2")]),
    dict(lang="en", slug="tess-of-the-durbervilles", id=110, title="Tess of the d'Urbervilles", author="Thomas Hardy",
         level="C2", start=r"^Phase the First:", short="Tess of the d'Urbervilles", title_headings=True,
         subs=[(r"^Phase the (\w+):[ \t]*\n(?:[ \t]*\n)*(\S.*)$", lambda m: f"PHASE THE {m[1]}: {m[2]}".upper())]),
    dict(lang="en", slug="the-essays-of-francis-bacon", id=575, title="The Essays of Francis Bacon",
         author="Francis Bacon", level="C2", start=r"^Of Truth\s*$", short="Essays", title_headings=True,
         cut=r"^A Glossary Of Archaic Words", subs=[(r"(?:\A|(?<=\n\n))(Of [A-Z][^\n]{2,60})(?=\n\n)", lambda m: m[1].upper())]),
    dict(lang="en", slug="of-human-bondage", id=351, title="Of Human Bondage", author="W. Somerset Maugham",
         level="C2", start=r"^I\s*\n\s*\nThe day broke gray", short="Of Human Bondage"),
    dict(lang="en", slug="war-and-peace", id=2600, title="War and Peace",
         author="Leo Tolstoy, translated by Louise and Aylmer Maude", level="C2", start=r"^BOOK ONE: 1805\s*\n",
         short="War and Peace", title_headings=True, subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="les-miserables", id=135, title="Les Misérables",
         author="Victor Hugo, translated by Isabel F. Hapgood", level="C2", start=r"^PREFACE\s*\n",
         short="Les Misérables", title_headings=True,
         subs=[(r"^VOLUME ([IVX]+)[ \t]*\n(\S.*)$", r"VOLUME \1: \2"), (r"^(BOOK [A-Z-]+)—", r"\1: "),
               (r"^(CHAPTER [IVXL]+)—", r"\1. ")]),
    dict(lang="fr", slug="nouveaux-contes-de-fees", id=14247,
         title="Nouveaux contes de fées pour les petits enfants", author="Comtesse de Ségur", level="A2",
         start=r"^ +HISTOIRE\s*\n +DE BLONDINE", short="Contes de fées", cut=r"^ +TABLE\s*$",
         heading_names=["Blondine", "Bonne-Biche", "Beau-Minon", "Henri", "Rosette", "Ourson", "Violette",
                        "Agnella", "Fourbette", "Bénin", "Encolure", "Coucou"]),
    dict(lang="fr", slug="voyage-au-centre-de-la-terre", id=4791, title="Voyage au centre de la Terre",
         author="Jules Verne", level="B1", start=r"^I\s*\n\s*\nLe 24 mai 1863", short="Voyage au centre de la Terre",
         heading_names=[]),
    dict(lang="fr", slug="arsene-lupin-gentleman-cambrioleur", id=32854, title="Arsène Lupin, gentleman-cambrioleur",
         author="Maurice Leblanc", level="B2", start=r"^L'ARRESTATION D'ARSÈNE LUPIN", short="Arsène Lupin",
         cut=r"^FIN\s*$", heading_names=["Arsène Lupin", "Herlock Sholmès", "Imbert"]),
    dict(lang="fr", slug="vingt-mille-lieues-sous-les-mers", id=5097, title="Vingt mille lieues sous les mers",
         author="Jules Verne", level="B2", start=r"^ +I\s*\n\s*\n +UN ÉCUEIL FUYANT",
         short="Vingt mille lieues sous les mers", cut=r"FIN DE LA SECONDE PARTIE",
         subs=[(r"_(NAUTILUS)_", r"\1")],
         heading_names=["Ned Land", "Nautilus", "Nemo", "Conseil", "Atlantide", "Abraham Lincoln", "Vanikoro",
                        "Torrès", "Arabian-Tunnel", "Ceylan", "Méditerranée", "Vigo", "Gulf-Stream", "Atlantique",
                        "Pacifique", "Crespo", "Papouas", "Aronnax", "Pôle", "Mer Rouge", "Mer de Corail",
                        "Mer des Sargasses", "Maelstrom", "Arabie", "Grèce", "Crète", "Manaar", "Indien"]),
    dict(lang="fr", slug="les-trois-mousquetaires", id=13951, title="Les Trois Mousquetaires",
         author="Alexandre Dumas et Auguste Maquet", level="C1", start=r"^PRÉFACE\s*\n",
         short="Les Trois Mousquetaires", cut=r"^FIN\s*$",
         heading_names=["D’Artagnan", "M.", "Tréville", "Athos", "Porthos", "Aramis", "Louis Treizième",
                        "Bonacieux", "Buckingham", "Milady", "Richelieu", "Rochefort", "Planchet", "Bazin",
                        "Mousqueton", "Grimaud", "Ketty", "Felton", "Winter", "Bastille", "Béthune", "Armentières",
                        "La Rochelle", "Saint-Gervais", "Anne d’Autriche", "Constance", "Patrick", "Lille",
                        "Boulogne", "Saint-Germain", "Chantilly", "Amiens", "Louvre", "Meung", "Portsmouth",
                        "Jussac", "Bernajoux", "Cahusac", "Biscarat", "Lyon", "Gascogne", "Séguier", "Coquenard",
                        "Lord", "Brisemont", "Aiguillon", "XVIIe"],
         subs=[(r"^CHAPITRE (PREMIER|[IVXLC]+)\.?[ \t]*\n(?:[ \t]*\n)*(\S.*)$",
                lambda m: f"CHAPITRE {'I' if m[1] == 'PREMIER' else m[1]}. {m[2]}"),
               (r"XVIIe SIÈCLE", "XVIIE SIÈCLE")]),
    dict(lang="fr", slug="le-rouge-et-le-noir", id=798, title="Le Rouge et le Noir", author="Stendhal",
         level="C1", start=r"^VOLUME PREMIER\s*$", short="Le Rouge et le Noir", cut=r"^FIN\s*$",
         heading_names=["Verrières", "M.", "Rênal", "Julien", "Valenod", "Besançon", "Paris", "La Mole",
                        "Mathilde", "Pirard", "Chélan", "Fouqué", "Korasoff", "Altamira", "Strasbourg",
                        "Londres", "Sorel", "Élisa", "Derville", "Vergy", "Agde", "Croisenois", "Fervaques",
                        "Bray-le-Haut", "Saint-Cloud", "Dieu", "Marquis", "Napoléon"],
         subs=[(r"^CHAPITRE (PREMIER|[IVXLC]+)\.?[ \t]*\n(?:[ \t]*\n)*(\S.*)$",
                lambda m: f"CHAPITRE {'I' if m[1] == 'PREMIER' else m[1]}. {m[2]}"),
               (r"^ {4,}([A-ZÀ-Ý][A-ZÀ-Ý .'-]+)[ \t]*$", lambda m: "— " + title_case(m[1]))]),
    dict(lang="fr", slug="les-vacances", id=15057, title="Les Vacances", author="Comtesse de Ségur", level="A2",
         start=r"^I\. L'arrivée\.\s*\n\s*\nTout était en l'air", short="Les Vacances", heading_names=[],
         subs=[ROMAN_DOT_TITLE, SEGUR_SPEAKERS, (r"^\s*\[\d+\][^\n]*$", "")]),
    dict(lang="fr", slug="le-general-dourakine", id=12979, title="Le Général Dourakine", author="Comtesse de Ségur",
         level="A2", start=r"^I\s*\n\s*\nDE LOUMIGNY A GROMILINE", short="Le Général Dourakine",
         heading_names=["Dourakine", "Loumigny", "Gromiline", "Papofski", "Dérigny", "Natasha", "Romane", "Jacques",
                        "Paul", "Sibérie", "Pologne"], subs=[FR_TITLED, SEGUR_SPEAKERS]),
    dict(lang="fr", slug="jean-qui-grogne-et-jean-qui-rit", id=18090, title="Jean qui grogne et Jean qui rit",
         author="Comtesse de Ségur", level="A2", start=r"^I\s*\n\s*\nLE DÉPART", short="Jean qui grogne",
         cut=r"^\s*TABLE", heading_names=["Jean", "Jeannot", "Simon", "Abel", "Kersac", "Paris", "Moutonnet", "M."],
         subs=[FR_TITLED, SEGUR_SPEAKERS, SEGUR_SPEAKERS_DASH]),
    dict(lang="fr", slug="francois-le-bossu", id=13013, title="François le Bossu", author="Comtesse de Ségur",
         level="A2", start=r"^I\s*\n\s*\nCOMMENCEMENT D'AMITIÉ", short="François le Bossu", cut=r"^\s*TABLE",
         heading_names=["François", "Christine", "Paolo", "Gabrielle", "Nancé", "Cémiane", "Isabelle", "M."],
         subs=[FR_TITLED, (r"^(?!CHAPITRE )((?:M\. |MME |MADAME )?[A-ZÀ-Ý][A-ZÀ-Ý' .-]{1,40}?)[:.]?[ \t]*\n\s*\n",
                           lambda m: title_case(m[1]) + " : ")]),
    dict(lang="fr", slug="histoires-naturelles", id=44255, title="Histoires naturelles", author="Jules Renard",
         level="A2", start=r"^LE CHASSEUR D'IMAGES", short="Histoires naturelles", cut=r"^TABLE DES MATIÈRES",
         heading_names=[]),
    dict(lang="fr", slug="contes-du-lundi", id=50154, title="Contes du lundi", author="Alphonse Daudet", level="B1",
         start=r"^PREMIÈRE PARTIE\s*\n(?:\s*\n)*LA FANTAISIE ET L'HISTOIRE", short="Contes du lundi",
         cut=r"^FIN\s*$", heading_names=["Alsace", "Paris", "Prusse", "Berlin", "Bismarck", "Turco", "Mauvais Zouave",
                                         "Colmar", "Dollinger", "Alsacien", "Noël", "Arthur", "Kadour", "Katel"],
         subs=[(r"\[Footnote[^\]]*\]", "")]),
    dict(lang="fr", slug="tartarin-de-tarascon", id=10687, title="Tartarin de Tarascon", author="Alphonse Daudet",
         level="B1", start=r"^PREMIER ÉPISODE\s*$", short="Tartarin de Tarascon", cut=r"^NOTES\s*$",
         heading_names=["Tarascon", "Tartarin", "Afrique", "Alger", "Turcs", "Teurs", "Bombonnel"], subs=[FR_TITLED]),
    dict(lang="fr", slug="en-famille", id=13793, title="En famille", author="Hector Malot", level="B1",
         start=r"^I\s*\n\s*\nComme cela arrive souvent", short="En famille", cut=r"^FIN\s*$"),
    dict(lang="fr", slug="la-mare-au-diable", id=23582, title="La Mare au diable", author="George Sand", level="B1",
         start=r"^L’AUTEUR AU LECTEUR\s*$", short="La Mare au diable",
         heading_names=["Germain", "Maurice", "Marie", "Petit-Pierre", "Guillette", "Diable"]),
    dict(lang="fr", slug="la-petite-fadette", id=34204, title="La Petite Fadette", author="George Sand", level="B1",
         start=r"^I\.\s*$", short="La Petite Fadette", cut=r"^FIN\.\s*$"),
    dict(lang="fr", slug="le-grand-meaulnes", id=5781, title="Le Grand Meaulnes", author="Alain-Fournier", level="B1",
         start=r"^PREMIÈRE PARTIE\s*$", short="Le Grand Meaulnes", cut=r"^FIN\s*$",
         heading_names=["Meaulnes", "Frantz", "Yvonne", "Valentine", "Seurel", "Sainte-Agathe", "Jasmin", "Ganache",
                        "M.", "Mme"], subs=[(r"_\((suite|fin)\)_", lambda m: f"({m[1].upper()})"), FR_CHAPITRE_TITLE]),
    dict(lang="fr", slug="le-fantome-de-l-opera", id=62215, title="Le Fantôme de l'Opéra", author="Gaston Leroux",
         level="B1", start=r"^AVANT-PROPOS\s*$", short="Le Fantôme de l'Opéra",
         heading_names=["Opéra", "Christine", "Raoul", "Erik", "Daaé", "Perse", "Philippe", "Faust", "Don Juan",
                        "Carlotta", "MM.", "Moncharmin", "Richard", "Giry"],
         subs=[(r"\[Note \d+:[^\]]*\]", "")]),
    dict(lang="fr", slug="le-mystere-de-la-chambre-jaune", id=13765, title="Le Mystère de la chambre jaune",
         author="Gaston Leroux", level="B1", start=r"^I\s*\n\s*\nOù l'on commence", short="La Chambre jaune",
         heading_names=[], subs=[FR_TITLED]),
    dict(lang="fr", slug="de-la-terre-a-la-lune", id=38674, title="De la Terre à la Lune", author="Jules Verne",
         level="B1", start=r"^CHAPITRE PREMIER\s*\n\s*\nLE GUN-CLUB", short="De la Terre à la Lune",
         cut=r"^_FIN DE LA TERRE",
         heading_names=["Gun-Club", "Barbicane", "Michel Ardan", "Nicholl", "Maston", "Lune", "Floride", "Texas",
                        "Cambridge", "Stone's-Hill", "Columbiad", "Tampa-Town", "Atlantique", "Longs-Peak"],
         subs=[FR_CHAPITRE_TITLE]),
    dict(lang="fr", slug="autour-de-la-lune", id=4717, title="Autour de la Lune", author="Jules Verne", level="B1",
         start=r"^CHAPITRE PRÉLIMINAIRE", short="Autour de la Lune", cut=r"^\s*FIN\s*$", heading_names=[],
         subs=[FR_TITLED]),
    dict(lang="fr", slug="cinq-semaines-en-ballon", id=4548, title="Cinq semaines en ballon", author="Jules Verne",
         level="B1", start=r"^CHAPITRE PREMIER\s*$", short="Cinq semaines en ballon", heading_names=[]),
    dict(lang="fr", slug="l-ile-mysterieuse", id=14287, title="L'Île mystérieuse", author="Jules Verne", level="B2",
         start=r"^PARTIE 1\s*\n(?:\s*\n)*LES NAUFRAGÉS DE L'AIR", short="L'Île mystérieuse", heading_names=[],
         subs=[(r"^PARTIE (\d)[ \t]*\n(?:[ \t]*\n)*(\S.*)$", r"PARTIE \1: \2")]),
    dict(lang="fr", slug="michel-strogoff", id=7442, title="Michel Strogoff", author="Jules Verne", level="B2",
         start=r"^CHAPITRE Ier\s*\n\s*\nUNE FÊTE", short="Michel Strogoff",
         heading_names=["Michel Strogoff", "Strogoff", "Moscou", "Irkoutsk", "Nijni-Novgorod", "Ogareff", "Nadia",
                        "Alcide Jolivet", "Blount", "Tartares", "Russes", "Sibérie", "Volga", "Kama", "Ob",
                        "Tomsk", "Féofar", "Iénisséi", "Angara", "Baïkal", "Marfa", "Sangarre", "Palais-Neuf"],
         subs=[(r"^CHAPITRE (Ier|[IVXLC]+)\.?[ \t]*\n(?:[ \t]*\n)*(\S.*)$",
                lambda m: f"CHAPITRE {'I' if m[1] == 'Ier' else m[1]}. {m[2]}")]),
    dict(lang="fr", slug="les-enfants-du-capitaine-grant", id=14163, title="Les Enfants du capitaine Grant",
         author="Jules Verne", level="B2",
         start=r"^PREMIÈRE PARTIE\s*\n(?:\s*\n)*Chapitre I\s*\n_Balance-fish_", short="Les Enfants du capitaine Grant",
         heading_names=[], subs=[(r"^Chapitre ([IVXLC]+)[ \t]*\n(\S.*)$", r"Chapitre \1. \2")]),
    dict(lang="fr", slug="le-comte-de-monte-cristo", id=17989, title="Le Comte de Monte-Cristo",
         author="Alexandre Dumas et Auguste Maquet", level="B2", short="Le Comte de Monte-Cristo", heading_names=[],
         parts=[dict(id=17989, start=r"^I\s*\n\s*\nMarseille", stop=r"^FIN DU TOME"),
                dict(id=17990, start=r"^XXXII\s*\n\s*\nRéveil", stop=r"^FIN DU TOME"),
                dict(id=17991, start=r"^LVI\s*\n\s*\nAndrea Cavalcanti", stop=r"^FIN DU TOME"),
                dict(id=17992, start=r"^LXXXV\s*\n\s*\nLe voyage", stop=r"^FIN\s*$")],
         subs=[FR_TITLED]),
    dict(lang="fr", slug="vingt-ans-apres", id=13952, title="Vingt ans après", author="Alexandre Dumas et Auguste Maquet",
         level="C1", start=r"^I\. Le fantôme de Richelieu\s*\n\s*\nDans une chambre", short="Vingt ans après",
         cut=r"^FIN\s*$", heading_names=[], subs=[ROMAN_DOT_TITLE]),
    dict(lang="fr", slug="la-tulipe-noire", id=26504, title="La Tulipe noire", author="Alexandre Dumas et Auguste Maquet",
         level="B2", start=r"^I\s*\n\s*\nUn peuple reconnaissant", short="La Tulipe noire", heading_names=[],
         subs=[FR_TITLED, (r"^\s*\[\d+\][^\n]*$", "")]),
    dict(lang="fr", slug="la-reine-margot", id=13856, title="La Reine Margot", author="Alexandre Dumas et Auguste Maquet",
         level="C1", short="La Reine Margot", heading_names=[],
         parts=[dict(id=13856, start=r"^PREMIÈRE PARTIE\s*\n(?:\s*\n)*I\s*\nLe latin de M\. de Guise", stop=r"^FIN DE LA PREMIÈRE PARTIE"),
                dict(id=13857, start=r"^I\s*\nFraternité", stop=r"^FIN\s*$")],
         subs=[FR_TITLED, (r"^\s*\[\d+\][^\n]*$", ""), (r"^\s*- \d+ -\s*$", "")]),
    dict(lang="fr", slug="la-dame-aux-camelias", id=2419, title="La Dame aux camélias", author="Alexandre Dumas fils",
         level="B2", start=r"^Chapitre I\s*$", short="La Dame aux camélias", cut=r"^FIN\s*$", subs=[(r"^\*/[ \t]*$", "")]),
    dict(lang="fr", slug="le-horla", id=10775, title="Le Horla", author="Guy de Maupassant", level="B2",
         start=r"^LE HORLA\s*$", short="Le Horla", cut=r"^\s*FIN\s*$", heading_names=[]),
    dict(lang="fr", slug="contes-du-jour-et-de-la-nuit", id=14790, title="Contes du jour et de la nuit",
         author="Guy de Maupassant", level="B2", start=r"^LE CRIME AU PÈRE BONIFACE", short="Contes du jour et de la nuit",
         cut=r"^\s*TABLE", heading_names=["Boniface", "Rose", "Pierre", "Coco", "Mon Oncle Jules", "Jules"]),
    dict(lang="fr", slug="contes-de-la-becasse", id=11714, title="Contes de la Bécasse", author="Guy de Maupassant",
         level="B2", start=r"^LA BÉCASSE\s*$", short="Contes de la Bécasse", cut=r"^\s*TABLE",
         heading_names=["Morin", "Pierrot", "Walter Schnaffs", "Saint-Antoine"]),
    dict(lang="fr", slug="pierre-et-jean", id=11131, title="Pierre et Jean", author="Guy de Maupassant", level="B2",
         start=r"^I\s*\n\s*\n--Zut!", short="Pierre et Jean", cut=r"^FIN\s*$"),
    dict(lang="fr", slug="zadig", id=4647, title="Zadig, ou la Destinée", author="Voltaire", level="B2",
         start=r"^CHAPITRE 1\.\s*$", short="Zadig", cut=r"FIN DE L'HISTOIRE DE ZADIG", heading_names=["Zadig"],
         subs=[VOLTAIRE_NOTES, VOLTAIRE_CHAPTER]),
    dict(lang="fr", slug="micromegas", id=4649, title="Micromégas", author="Voltaire", level="B2",
         start=r"^CHAPITRE I\.\s*$", short="Micromégas", cut=r"FIN DE L'HISTOIRE DE MICROMÉGAS",
         heading_names=["Micromégas", "Sirius", "Saturne"],
         subs=[(r"^CHAPTTRE", "CHAPITRE"), VOLTAIRE_NOTES, VOLTAIRE_CHAPTER]),
    dict(lang="fr", slug="colomba", id=16239, title="Colomba", author="Prosper Mérimée", level="B2",
         start=r"^I\s*\n\s*\nPè far la to vandetta", short="Colomba"),
    dict(lang="fr", slug="souvenirs-entomologiques", id=16825, title="Souvenirs entomologiques (Livre I)",
         author="Jean-Henri Fabre", level="B2", start=r"^CHAPITRE I\s*\nLE SCARABÉE SACRÉ",
         short="Souvenirs entomologiques", cut=r"^NOTES\s*$", heading_names=["Cerceris", "Sphex", "Ammophile",
                                                                           "Chalicodomes", "Bembex", "Ventoux"],
         subs=[FR_CHAPITRE_TITLE, (r"^\s*\[\d+\][^\n]*$", "")]),
    dict(lang="fr", slug="le-dernier-jour-d-un-condamne", id=6838, title="Le Dernier Jour d'un condamné",
         author="Victor Hugo", level="B2", start=r"^I\s*\n\s*\nBicêtre", short="Le Dernier Jour d'un condamné"),
    dict(lang="fr", slug="une-vie", id=17457, title="Une vie", author="Guy de Maupassant", level="C1",
         start=r"^-- I --\s*$", short="Une vie", subs=[(r"^-- ([IVXL]+) --[ \t]*$", r"\1")]),
    dict(lang="fr", slug="bel-ami", id=57430, title="Bel-Ami", author="Guy de Maupassant", level="C1",
         start=r"^PREMIÈRE PARTIE\.\s*$", short="Bel-Ami", stop=r"^FIN\s*$", heading_names=[]),
    dict(lang="fr", slug="eugenie-grandet", id=11049, title="Eugénie Grandet", author="Honoré de Balzac", level="C1",
         start=r"^Il se trouve dans certaines provinces", short="Eugénie Grandet"),
    dict(lang="fr", slug="l-assommoir", id=6497, title="L'Assommoir", author="Émile Zola", level="C1",
         start=r"^PRÉFACE\s*$", short="L'Assommoir", heading_names=["Zola"]),
    dict(lang="fr", slug="nana", id=5250, title="Nana", author="Émile Zola", level="C1",
         start=r"^I\s*\n(?:\s*\n)*A neuf heures", short="Nana"),
    dict(lang="fr", slug="au-bonheur-des-dames", id=16852, title="Au Bonheur des Dames", author="Émile Zola",
         level="C1", start=r"^I\s*\n\s*\nDenise était venue", short="Au Bonheur des Dames"),
    dict(lang="fr", slug="therese-raquin", id=7461, title="Thérèse Raquin", author="Émile Zola", level="C1",
         start=r"^I\s*\n\s*\nAu bout de la rue Guénégaud", short="Thérèse Raquin", cut=r"^FIN\s*$"),
    dict(lang="fr", slug="la-bete-humaine", id=5154, title="La Bête humaine", author="Émile Zola", level="C1",
         start=r"^I\s*\n\s*\nEn entrant dans la chambre", short="La Bête humaine"),
    dict(lang="fr", slug="manon-lescaut", id=17983, title="Manon Lescaut", author="Abbé Prévost", level="C1",
         start=r"^AVIS DE L'AUTEUR\s*\n\s*\n", short="Manon Lescaut", cut=r"^FIN DE LA DEUXIEME PARTIE",
         heading_names=[]),
    dict(lang="fr", slug="quatrevingt-treize", id=9645, title="Quatrevingt-treize", author="Victor Hugo", level="C1",
         start=r"^PREMIÈRE PARTIE\s*\n(?:\s*\n)*EN MER", short="Quatrevingt-treize",
         heading_names=["Saudraie", "Claymore", "Lantenac", "Gauvain", "Cimourdain", "Tourgue", "Paris", "Danton",
                        "Marat", "Robespierre", "Angleterre", "France", "Dol", "Vendée", "Halmalo"],
         subs=[(r"\[Footnote[^\]]*\]", "")]),
    dict(lang="fr", slug="les-travailleurs-de-la-mer", id=79493, title="Les Travailleurs de la mer",
         author="Victor Hugo", level="C1", short="Les Travailleurs de la mer",
         heading_names=["Manche", "Clubin", "Gilliatt", "Déruchette", "Lethierry", "Durande", "Douvres", "Guernesey",
                        "Saint-Malo", "Sark", "Rantaine", "Ébenézer", "Saint-Pierre-Port", "Jersey", "Aurigny", "Serk"],
         parts=[dict(id=79493, start=r"^L'ARCHIPEL DE LA MANCHE\s*$", cut=r"^\s*TABLE"),
                dict(id=79659, start=r"^DEUXIÈME PARTIE\s*$", cut=r"^\s*_?NOTES_?\s*$")]),
    dict(lang="fr", slug="la-chartreuse-de-parme", id=796, title="La Chartreuse de Parme", author="Stendhal",
         level="C2", start=r"^LIVRE PREMIER\s*$", short="La Chartreuse de Parme",
         heading_names=["Milan", "Waterloo", "Fabrice", "Parme", "Mosca", "Sanseverina", "Clélia", "Ferrante",
                        "Palla", "Ernest", "Gina", "Grianta", "Côme", "Bologne", "Blanès"],
         subs=[FR_CHAPITRE_TITLE]),
    dict(lang="fr", slug="les-reveries-du-promeneur-solitaire", id=65434,
         title="Les Rêveries du promeneur solitaire", author="Jean-Jacques Rousseau", level="C2",
         start=r"^PREMIÈRE PROMENADE\s*\n\s*\n\s*Me voici", short="Les Rêveries", cut=r"^SOMMAIRES\s*$",
         heading_names=[], subs=[(r"\[Figure \d+\]", "")]),
    dict(lang="fr", slug="les-liaisons-dangereuses", id=52006, title="Les Liaisons dangereuses",
         author="Choderlos de Laclos", level="C2", start=r"^PRÉFACE DU RÉDACTEUR\s*$", short="Les Liaisons dangereuses",
         cut=r"^BIBLIOTHÈQUE DES CURIEUX", heading_names=["Valmont", "Merteuil", "Volanges", "Tourvel",
                                                                     "Danceny", "Rosemonde", "Cécile", "Sophie Carnay"]),
    dict(lang="fr", slug="les-miserables", id=17489, title="Les Misérables", author="Victor Hugo", level="C2",
         short="Les Misérables",
         heading_names=["Myriel", "Bienvenu", "Jean Valjean", "Valjean", "Fantine", "Cosette", "Marius", "Javert",
                        "Thénardier", "Gavroche", "Éponine", "Enjolras", "Waterloo", "Montreuil-sur-Mer", "Paris",
                        "Plumet", "Saint-Denis", "Petit-Picpus", "Gorbeau", "Fauchelevent", "Champmathieu", "Arras",
                        "Digne", "Montfermeil", "Gillenormand", "Pontmercy", "Napoléon", "Louis-Philippe",
                        "Hougomont", "Patron-Minette", "Corinthe", "Mabeuf", "Charybde", "Scylla", "Saint-Antoine"],
         parts=[dict(id=17489, start=r"^Livre premier--Un juste\s*\n(?:\s*\n)+Chapitre I\s*$", heading="TOME I: FANTINE"),
                dict(id=17493, start=r"^Livre premier--Waterloo\s*\n(?:\s*\n)+Chapitre I\s*$", heading="TOME II: COSETTE"),
                dict(id=17494, start=r"^Livre premier--Paris étudié dans son atome\s*\n(?:\s*\n)+Chapitre I\s*$",
                     heading="TOME III: MARIUS"),
                dict(id=17518, start=r"^Livre premier--Quelques pages d'histoire\s*\n(?:\s*\n)+Chapitre I\s*$",
                     heading="TOME IV: L'IDYLLE RUE PLUMET ET L'ÉPOPÉE RUE SAINT-DENIS"),
                dict(id=17519, start=r"^Livre premier--La guerre entre quatre murs\s*\n(?:\s*\n)+Chapitre I\s*$",
                     heading="TOME V: JEAN VALJEAN")],
         subs=[(r"^Livre ([^\n]+?)--([^\n]+)$", lambda m: f"LIVRE {m[1]}: {m[2]}".upper()),
               (r"^Chapitre ([IVXLC]+)[ \t]*\n(?:[ \t]*\n)*(\S.*)$", r"Chapitre \1. \2")]),
    dict(lang="fr", slug="les-fleurs-du-mal", id=6099, title="Les Fleurs du mal", author="Charles Baudelaire",
         level="C2", start=r"^ *AU LECTEUR\s*$", short="Les Fleurs du mal", verse=True, heading_names=[]),
    dict(lang="fr", slug="discours-de-la-methode", id=13846, title="Discours de la méthode", author="René Descartes",
         level="C2", start=r"^PREMIÈRE PARTIE\.\s*\n\s*\nLe bon sens", short="Discours de la méthode",
         stop=r"^MÉDITATIONS MÉTAPHYSIQUES", heading_names=[]),
    dict(lang="es", slug="libro-segundo-de-lectura", id=11047, title="Libro segundo de lectura",
         author="Ellen M. Cyr", level="A1", start=r"^--¡Buenos días, amiguita Luisa!", short="Libro segundo",
         subs=[(r"^ {6,}.*$", ""), (r"^[^\s-]\S*(--\S+)+\.?[ \t]*$", "")]),
    dict(lang="es", slug="a-first-spanish-reader", id=15353, title="A First Spanish Reader",
         author="Erwin W. Roessler y Alfred Remy", level="A1", start=r"^1\. LA ESCUELA\s*$", short="Primer libro",
         cut=r"^PREGUNTAS\s*$", subs=[(r"^\d{1,2}\. (?=[A-ZÁÉÍÓÚÑ¿])", "")], verse="auto",
         heading_names=["España", "Estados Unidos", "Brasil", "Chile", "Méjico", "Argentina", "Cuba", "David", "Suez",
                        "Coruña", "Salamanca", "Panamá", "Matsuyama", "Tamburí", "Manuel Fenollosa", "Marica",
                        "Guatemala", "I", "II", "III", "Iriarte", "Madrid", "Jaime Nuñó", "Rafael Alvarez"]),
    dict(lang="es", slug="an-elementary-spanish-reader", id=22065, title="An Elementary Spanish Reader",
         author="Earl Stanley Harrison", level="A2", start=r"^EL CUENTO DEL POLLO\s*\n\s*\nUn día",
         short="Cuentos", stop=r"^ABBREVIATIONS\s*$",
         verse="auto", heading_names=["Juan Bolondrón", "Jalma", "Madrid", "Aliatar", "Iriarte"],
         subs=[(r"(?s)\[Note \d+:.*?\]", ""), (r"[ \t]{2,}\d{1,3}[ \t]*$", "")]),
    dict(lang="es", slug="lecturas-faciles", id=24250, title="Lecturas fáciles",
         author="Lawrence A. Wilkins y Max A. Luria", level="A2", start="", short="Lecturas fáciles",
         extractor="lecturas_faciles", verse="auto", subs=[(r"(?s)\[Illustration:.*?\]", "")],
         heading_names=["Hamelin", "La vida es sueño", "Calderón de la Barca", "Colón", "Diego Pérez", "Mayflower", "Emilio Castelar", "Panamá",
                        "Puerto Rico", "Argentina", "Brasil", "Chile", "Costa Rica", "Cuenca", "Ecuador", "Méjico",
                        "Perú", "Venezuela", "Fray Gómez", "América", "España"]),
    dict(lang="es", slug="spanish-tales-for-beginners", id=36805, title="Spanish Tales for Beginners",
         author="Echegaray, Trueba, Pardo Bazán, Alarcón y otros (ed. Elijah C. Hills)", level="B1",
         start=r"^LOS CONSEJOS DE UN PADRE\s*\n\s*\n\s*El León", short="Cuentos",
         stop=r"^NOTES\s*$", verse="auto",
         subs=ES_OLD_ACCENTS + ES_PLATES + [(r"\((?:After many|The scene)[^)]*\)", ""),
                                            (r"\(From _[^)]*\)", "")]),
    dict(lang="es", slug="corazon", id=73486, title="Corazón (comienzo)", author="Edmundo de Amicis", level="B1",
         start=r"^\s*EL PRIMER DÍA DE ESCUELA\s*$", short="Corazón", max_words=35000, subs=ES_PLATES,
         heading_names=["Garrón", "Coreta", "Nelle", "Estardo", "Víctor Manuel", "Franti"]),
    dict(lang="es", slug="platero-y-yo", id=39209, title="Platero y yo", author="Juan Ramón Jiménez", level="B1",
         start=r"^I\s*\n\s*\nPLATERO\s*$", short="Platero", stop=r"^FIN\s*$",
         subs=ES_OLD_ACCENTS + ES_PLATES + [(r"</?i>", "_"), (r"^<tb>[ \t]*$", "")], verse="auto"),
    dict(lang="es", slug="marianela", id=17340, title="Marianela", author="Benito Pérez Galdós", level="B2",
         start=r"^-I-\s*\n\s*Perdido", short="Marianela",
         heading_names=["Aldeacorba", "Celipín", "Nela", "Virgen María", "R. I. P.", "María Manuela Téllez", "Marianela"], subs=ES_PLATES + [
             (r"^-([IVXL]+)-[ \t]*\n\s*(.+)$", lambda m: f"{m[1]}. {m[2].upper()}")]),
    dict(lang="es", slug="raton-perez", id=36558, title="Ratón Pérez", author="Luis Coloma", level="B2",
         start=r"^Entre la muerte del rey que rabió", short="Ratón Pérez", stop=r"^Biblioteca de RAZÓN Y FE",
         subs=ES_OLD_ACCENTS + ES_PLATES + [(r"\[[A-Z]\]", "")]),
    dict(lang="es", slug="cuando-la-tierra-era-nina", id=55215, title="Cuando la tierra era niña",
         author="Nathaniel Hawthorne, traducido por G. Martínez Sierra", level="B2",
         start=r"^EL PÓRTICO DE TANGLEWOOD\s*$", stop=r"^FIN\s*$", short="Cuando la tierra era niña", subs=ES_OLD_ACCENTS + ES_PLATES),
    dict(lang="es", slug="cuentos-de-la-alhambra", id=52262, title="Cuentos de la Alhambra",
         author="Washington Irving, traducido en 1833", level="C1", start=r"^El Viage\.\s*$", short="Alhambra",
         subs=ES_OLD_ACCENTS + ES_PLATES + [
             (r"^(?i:(El Viage|Gobierno de la Alhambra|Interior de la Alhambra|Economía doméstica|Tradiciones locales|La casa del Gallo|Leyenda del astrólogo árabe|Historia del príncipe Ahmed Al Kamel[^\n]*?))\.?[ \t]*$",
              lambda m: m[1].upper())],
         heading_names=["Alhambra", "Gallo", "Ahmed Al Kamel"]),
    dict(lang="es", slug="lazarillo-de-tormes", id=320, title="Vida de Lazarillo de Tormes y de sus fortunas y adversidades",
         author="Anónimo", level="C1", start=r"^Prólogo\s*$", short="Lazarillo", subs=ES_PLATES + [
             (r"[{}]", ""), (r"^Prólogo[ \t]*$", "PRÓLOGO"),
             (r"^(Tratado \w+)[ \t]*\n\s*\n(.+)$", lambda m: m[1].upper() + "\n\n" + m[2])],
         heading_names=["Lázaro"]),
    dict(lang="es", slug="becquer-leyendas", id=53552, title="Leyendas (selección)", author="Gustavo Adolfo Bécquer",
         level="C1", start=r"^MAESE PÉREZ EL ORGANISTA\s*$", stop=r"^EL MONTE DE LAS ÁNIMAS\s*$", short="Leyendas",
         subs=ES_OLD_ACCENTS + ES_PLATES, heading_names=["Maese Pérez"]),
    dict(lang="es", slug="don-quijote", id=2000, title="Don Quijote de la Mancha (Primera parte, comienzo)",
         author="Miguel de Cervantes Saavedra", level="C2", start=r"^Capítulo primero\. Que trata de la condición",
         short="Don Quijote", max_words=35000, heading_names=["I", "V", "X", "L"], subs=ES_PLATES + [
             (r"^(Cap[ií]tulo [^.\n]+)\.[ \t]+", lambda m: m[1].upper() + "\n\n")]),
    dict(lang="es", slug="vida-de-don-quijote-y-sancho", id=75472, title="Vida de Don Quijote y Sancho (comienzo)",
         author="Miguel de Unamuno", level="C2", start=r"^\s*PRÓLOGO A ESTA SEGUNDA EDICIÓN\s*$", short="Unamuno",
         max_words=35000, subs=ES_PLATES, heading_names=["I", "V", "X", "L", "Miguel de Unamuno", "Don Quijote", "Quijote"]),
    dict(lang="es", slug="meditaciones-del-quijote", id=57448, title="Meditaciones del Quijote",
         author="José Ortega y Gasset", level="C2", start=r"^LECTOR\.\.\.\s*$", stop=r"^\s*ÍNDICE\s*$",
         short="Meditaciones", max_words=35000, subs=ES_PLATES,
         heading_names=["Quijote", "Hermann Cohen", "Ethik des reinen Willens"]),
    dict(lang="zh", zh=True, slug="gushi-xin-dubo", id=67976, title="故事新读本（第一册）",
         author="上海大东书局", level="B1", start=r"^（一）\u3000文彥博灌穴取球", cut=r"^抄者後記", short="故事新读本",
         heading_re=r"^（[一二三四五六七八九十]+） ",
         subs=[(r"[{}]", ""), (r"^\[图：[^\]]*\]\s*$", "")]),
    dict(lang="zh", zh=True, slug="rulin-waishi", id=24032, title="儒林外史（开头）", author="吴敬梓", level="B2",
         start=r"^第一回\u3000說楔子敷陳大義", short="儒林外史", max_words=35000, short_break=True,
         heading_re=r"^第[一二三四五六七八九十百零〇]+回"),
    dict(lang="zh", zh=True, slug="jingshi-tongyan", id=24141, title="警世通言（开头）", author="冯梦龙", level="C1",
         start=r"^第一卷\s+俞伯牙", short="警世通言", max_words=35000,
         heading_re=r"^第[一二三四五六七八九十百零〇]+卷"),
    dict(lang="zh", zh=True, slug="shuihu-zhuan", id=23863, title="水浒传（开头）", author="施耐庵", level="C1",
         start=r"^楔子\u3000張天師祈禳瘟疫", short="水浒传", max_words=35000,
         heading_re=r"^(楔子|第[一二三四五六七八九十百零〇]+回)"),
    dict(lang="zh", zh=True, slug="xiyouji", id=23962, title="西游记（开头）", author="吴承恩", level="C1",
         start=r"^第一回\s+靈根育孕源流出", short="西游记", max_words=35000,
         heading_re=r"^第[一二三四五六七八九十百零〇]+回"),
    dict(lang="zh", zh=True, slug="honglou-meng", id=24264, title="红楼梦（开头）", author="曹雪芹", level="C2",
         start=r"^第一回\u3000甄士隱夢幻識通靈", short="红楼梦", max_words=35000,
         heading_re=r"^第[一二三四五六七八九十百零〇]+回",
         subs=[(r"^-{10,}\s*$", ""), (r"．", "。"), (r"^(第[一二三四五六七八九十百零〇]+回)[ \t]*\n\s*([^\n]+)$", r"\1 \2")]),
    dict(lang="zh", zh=True, slug="sanguo-yanyi", id=23950, title="三国演义（开头）", author="罗贯中", level="C2",
         start=r"^第一回：宴桃園豪傑三結義", short="三国演义", max_words=35000,
         heading_re=r"^第[一二三四五六七八九十百零〇]+回"),
    dict(lang="zh", zh=True, slug="lunyu", id=23839, title="论语", author="孔子弟子及再传弟子", level="C2",
         start=r"^學而第一", short="论语", heading_re=r"^.{1,5}第[一二三四五六七八九十]+$"),
]

ROMAN = re.compile(r"^[IVXLC]+\.?$")


HAN = re.compile(r"[\u3400-\u9fff]")


def words(text: str) -> int:
    """Latin words count one each; Han characters count 1 per 1.6 (the usual word length)."""
    han = len(HAN.findall(text))
    return len(re.findall(r"\w+", HAN.sub(" ", text))) + round(han / 1.6)


ZH_MAP: tuple | None = None
ZH_TERMINAL = tuple("。！？…」』”’）")


def zh_simplify(text: str) -> str:
    """Traditional to Simplified with the dictionary build's map: listed words first, then single characters."""
    global ZH_MAP
    if ZH_MAP is None:
        m = json.loads(Path(__file__).with_name("zh-t2s-map.json").read_text(encoding="utf8"))
        keys = sorted((k for k in m["words"] if len(k) > 1), key=len, reverse=True)
        ZH_MAP = (re.compile("|".join(map(re.escape, keys))), m["words"], m["chars"])
    pattern, wmap, cmap = ZH_MAP
    out: list[str] = []
    pos = 0
    for hit in pattern.finditer(text):
        out.append("".join(cmap.get(c, c) for c in text[pos:hit.start()]))
        out.append(wmap[hit.group(0)])
        pos = hit.end()
    out.append("".join(cmap.get(c, c) for c in text[pos:]))
    return "".join(out)


def zh_paragraphs(text: str, heading_re: str | None, short_break: bool = False) -> list[str]:
    """Join hard-wrapped Chinese lines. A paragraph starts at an indented line after an unindented one,
    after two blank lines, or after a blank line that follows a closed sentence. With short_break, a closed
    sentence on a line shorter than most lines also ends a paragraph."""
    heading = re.compile(heading_re) if heading_re else None
    paras: list[str] = []
    cur: list[str] = []
    prev_indented = False
    blanks = 0
    width = max((len(ln.strip(" \t\u3000\xa0")) for ln in text.split("\n")), default=0)

    def flush() -> None:
        if cur:
            paras.append(re.sub(r"[\u3000\xa0□]+", "", "".join(cur)))
            cur.clear()

    for line in text.split("\n"):
        stripped = line.strip(" \t\u3000\xa0")
        if not stripped:
            blanks += 1
            continue
        indented = line[:1] == "\u3000" or line.startswith("  ")
        spaced = re.sub(r"[\s\u3000\xa0]+", " ", stripped)
        if heading and heading.match(spaced):
            flush()
            paras.append(spaced)
            prev_indented, blanks = False, 0
            continue
        if cur and (
            blanks >= 2
            or (blanks == 1 and cur[-1].endswith(ZH_TERMINAL))
            or (short_break and cur[-1].endswith(ZH_TERMINAL) and len(cur[-1]) < width * 0.85)
            or (indented and not prev_indented)
            or re.match(r"^\d+\. ", stripped)
        ):
            flush()
        cur.append(stripped)
        prev_indented, blanks = indented, 0
    flush()
    return paras


def body_of(raw: str, start: str, cut: str | None = None, stop: str | None = None) -> str:
    raw = raw.replace("\r", "")
    a = raw.find("*** START OF")
    a = raw.find("\n", a) + 1 if a != -1 else 0
    b = raw.find("*** END OF")
    text = raw[a:b if b != -1 else len(raw)]
    m = re.search(start, text, flags=re.M)
    if not m:
        raise SystemExit(f"start marker not found: {start}")
    text = text[m.start():]
    tail = re.search(r"^End of (the )?Project Gutenberg", text, flags=re.M | re.I)
    if tail:
        text = text[:tail.start()]
    if stop:
        first = re.search(stop, text, flags=re.M)
        if first:
            text = text[:first.start()]
    if cut:
        hits = list(re.finditer(cut, text, flags=re.M | re.I))
        if hits:
            text = text[:hits[-1].start()]
    return text


SKIP_SECTIONS = re.compile(
    r"^(ÉTUDE DE MOTS|CONVERSATION|GRAMMAIRE|THÈME|EXERCICES|COMPOSITION|QUESTIONNAIRE|REVUE|"
    r"VOCABULAIRE|PRONONCIATION)\b"
)


def extract_premier_livre(raw: str) -> str:
    """Keep only the story chapters of 'Le Premier Livre' (a 1915 beginner course).

    Each lesson holds word lists, questions, grammar tables and English
    exercises around one short French chapter. The chapter sits under a
    numbered, all-caps heading such as 'II. MÈRE BARBERIN'.
    """
    raw = raw.replace("\r", "")
    a = raw.find("PREMIÈRE LEÇON\n")
    b = raw.find("*** END OF")
    text = raw[a:b]
    out: list[str] = []
    section: list[str] | None = None
    for line in text.splitlines():
        m = re.match(r"^([IVX]+)\. (.+?)\s*$", line)
        if m and m.group(2).upper() == m.group(2):
            title = m.group(2)
            if section is not None:
                out.extend(section)
            section = None
            if not SKIP_SECTIONS.match(title):
                section = [title.strip(), ""]
            continue
        if re.match(r"^[A-ZÉÈÂ' -]*LEÇON\b", line) and line.upper() == line:
            if section is not None:
                out.extend(section)
            section = None
            continue
        if section is not None:
            section.append(line)
    if section is not None:
        out.extend(section)
    body = "\n".join(out)
    body = re.sub(r"\\|·", "", body)
    body = body.replace("[_u]", "").replace("[oe]", "œ").replace("[OE]", "Œ")
    return body


def extract_lecturas_faciles(raw: str) -> str:
    """Keep the stories and articles of 'Lecturas fáciles con ejercicios' (a 1916 school reader).

    Every selection is followed by exercises (some in English) and a block of
    notes. The text between a selection title and the next '=EJERCICIOS='
    marker is the reading; the exercises and notes up to the next all-caps
    title are dropped.
    """
    raw = raw.replace("\r", "")
    a = raw.index("EL VIEJO Y EL ASNO", raw.rfind("SECCIÓN DE CUENTOS EUROPEOS"))
    b = raw.index("APÉNDICE DE VERBOS", a)
    lines = raw[a:b].split("\n")
    out: list[str] = []
    skipping = False
    for i, line in enumerate(lines):
        s = line.strip()
        core = s.strip("= ")
        prev_blank = i == 0 or not lines[i - 1].strip()
        next_blank = i + 1 >= len(lines) or not lines[i + 1].strip()
        is_title = (
            prev_blank and next_blank and len(core) >= 4 and core == core.upper() and re.search(r"[A-ZÁÉÍÓÚÑ]{3}", core)
            and not core.startswith(("--", "[", "NOTES")) and not re.search(r"\d", core)
            and core not in ("EJERCICIOS",)
        )
        if s.startswith(("=EJERCICIOS=", "NOTES:")):
            skipping = True
            continue
        if skipping and not is_title:
            continue
        skipping = False
        if is_title and core == "REFRANES":
            break
        if is_title and (core in ("SECCIÓN PANAMERICANA",) or core.endswith("]")):
            continue
        if re.match(r"^\s*(/F|F/)\s*$", line) or (core.endswith("]") and core == core.upper()):
            continue
        if is_title:
            line = core
        if re.match(r"^--[A-ZÁÉÍÓÚÑ .]+\.$", s):
            continue
        line = re.sub(r"\s{2,}\d{1,3}\s*$", "", line)
        line = re.sub(r"\[\*\]", "", line)
        line = re.sub(r"=([^=]+)=", r"\1", line)
        out.append(line)
    return "\n".join(out)


def clean_paragraph(par: str, verse: bool) -> str | None:
    par = par.strip("\n")
    if not par.strip():
        return None
    first = par.strip().splitlines()[0].strip()
    if re.match(r"^\[(Illustration|Pg|Page)", first, flags=re.I) and "\n" not in par.strip():
        return None
    if re.match(r"^\[\d+\]", first):
        return None  # footnote text
    par = re.sub(r"\[Illustration[^\]]*\]", "", par)
    par = re.sub(r"\[\d+\]", "", par)
    par = par.replace("--", "—")
    lines = [ln.strip() for ln in par.splitlines() if ln.strip()]
    if not lines:
        return None
    if verse == "auto":
        verse = len(lines) >= 3 and all(re.match(r"^[\"“‘'«¡¿—A-ZÁÉÍÓÚÑ]", ln) for ln in lines)
    if verse and len(lines) > 1:
        return "  \n".join(lines)
    return re.sub(r"\s+", " ", " ".join(lines))


ZH_HEADING: re.Pattern | None = None


def is_heading(par: str) -> bool:
    if ZH_HEADING is not None:
        return bool(ZH_HEADING.match(par.strip()))
    if "\n" in par or len(par) > 80:
        return False
    plain = par.strip(" _*.")
    if plain[:1] in "“\"‘'—«»" or plain.endswith(","):
        return False
    return bool(ROMAN.match(plain)) or (len(plain) > 2 and plain == plain.upper() and re.search(r"[A-ZÀ-Ý]", plain)) \
        or bool(re.match(r"^(CHAPITRE|Chapitre|CHAPTER|Chapter)\b", plain)) \
        or bool(re.match(r"^(Book|Volume|Part) ([IVXLC]+|One|Two|Three|Four|Five|Six|Seven|Eight|the \w+)\b", plain))


def paragraphs(text: str, verse: bool) -> list[str]:
    out: list[str] = []
    for chunk in re.split(r"\n\s*\n", text):
        par = clean_paragraph(chunk, verse)
        if par:
            out.append(par)
    merged: list[str] = []
    for par in out:
        caps = "\n" not in par and len(par) <= 80 and par == par.upper() and re.search(r"[A-ZÀ-Ý]", par)
        if merged and (is_heading(par) or caps) and ROMAN.match(merged[-1].strip(" _*.")):
            merged[-1] = f"{merged[-1].strip(' _*.')}. {par.strip(' _*')}"
        else:
            merged.append(par)
    return merged


def _sentence(text: str) -> str:
    return text[:1].upper() + text[1:].lower()


def _capitalise_words(text: str) -> str:
    def word(match: re.Match) -> str:
        w = match.group(0)
        i = next((k for k, ch in enumerate(w) if ch.isalpha()), None)
        return w if i is None else w[:i] + w[i].upper() + w[i + 1:].lower()
    return re.sub(r"[^\s\-]+", word, text)


ROMAN_WORD = re.compile(r"\b(?=[ivxlc]{2,}\b)(c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})\b", re.I)


def _keep_roman(cased: str) -> str:
    """Chapter numbers such as II or XIV stay upper case after sentence casing."""
    return ROMAN_WORD.sub(lambda m: m.group(0).upper(), cased)


def titlecase_heading(text: str, capitalise: bool = False, title: bool = False, names: tuple | None = None) -> str:
    t = text.strip(" _*")
    if (title or names is not None) and ROMAN.match(t):
        return t.rstrip(".")
    if title and t.isupper():
        m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
        return f"{m[1]}. {_keep_roman(title_case(m[2]))}" if m else _keep_roman(title_case(t.rstrip(".")))
    if names is not None and t.isupper():
        m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
        cased = f"{m[1]}. {sentence_case(m[2], names)}" if m else sentence_case(t, names)
        return re.sub(r"^(Chapitre|Livre|Tome|Lettre) ([ivxlc]+)\b", lambda r: f"{r[1]} {r[2].upper()}", cased)
    if capitalise and t.isupper():
        return _keep_roman(_capitalise_words(t))
    m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
    if m:
        rest = _keep_roman(_sentence(m.group(2))) if m.group(2).isupper() else m.group(2)
        return f"{m.group(1)}. {rest}"
    return _keep_roman(_sentence(t)) if t.isupper() else t


def build(book: dict, raw_dir: Path, out_dir: Path) -> None:
    raw = (raw_dir / f"pg{book['id']}.txt").read_text(encoding="utf8", errors="replace")
    if book.get("parts"):
        text = unicodedata.normalize("NFC", "\n\n".join(
            (f"{part['heading']}\n\n" if part.get("heading") else "")
            + body_of((raw_dir / f"pg{part['id']}.txt").read_text(encoding="utf8", errors="replace"),
                      part["start"], part.get("cut"), part.get("stop"))
            for part in book["parts"]))
    elif book.get("extractor") == "premier_livre":
        text = unicodedata.normalize("NFC", extract_premier_livre(raw))
    elif book.get("extractor") == "lecturas_faciles":
        text = unicodedata.normalize("NFC", extract_lecturas_faciles(raw))
    else:
        text = unicodedata.normalize("NFC", body_of(raw, book["start"], book.get("cut"), book.get("stop")))
    global ZH_HEADING
    zh = book.get("zh", False)
    if zh:
        text = zh_simplify(text)
    for pattern, repl in book.get("subs", ()):
        text = re.sub(pattern, repl, text, flags=re.M)
    lesson_words = book.get("lesson_words", LESSON_WORDS)
    ZH_HEADING = re.compile(book["heading_re"]) if zh and book.get("heading_re") else None
    pars = zh_paragraphs(text, book.get("heading_re"), book.get("short_break", False)) if zh else paragraphs(text, book.get("verse", False))
    budget = book.get("max_words")
    lessons: list[list[str]] = [[]]
    count = 0
    total = 0
    for par in pars:
        w = words(par)
        if budget and total + w > budget and count > 0:
            break
        if count >= lesson_words:
            lessons.append([])
            count = 0
        lessons[-1].append(par)
        count += w
        total += w
    while lessons and lessons[-1] and is_heading(lessons[-1][-1]):
        lessons[-1].pop()
    if not lessons[-1] and len(lessons) > 1:
        lessons.pop()
    if len(lessons) > 1 and words("\n".join(lessons[-1])) < lesson_words // 4:
        lessons[-2].extend(lessons.pop())
    book_dir = out_dir / book["slug"]
    if book_dir.exists():
        shutil.rmtree(book_dir)
    book_dir.mkdir(parents=True)
    entries = []
    cap = book.get("capitalise_headings", False)
    title_mode = book.get("title_headings", False)
    names = tuple(book["heading_names"]) if "heading_names" in book else None
    for n, chunk in enumerate(lessons, start=1):
        head = next((titlecase_heading(p, cap, title_mode, names) for p in chunk[:1] if is_heading(p)), None)
        title = f"{n}. {head}" if head else f"{n}. {book['short']}"
        body = []
        for p in chunk:
            body.append(f"## {titlecase_heading(p, cap, title_mode, names)}" if is_heading(p) else p)
        name = f"{n:02d}.md"
        (book_dir / name).write_text(f"# {title}\n\n" + "\n\n".join(body) + "\n", encoding="utf8")
        entries.append({"file": name, "title": title})
    manifest = {
        "title": book["title"],
        "author": book["author"],
        "level": book["level"],
        "wordCount": total,
        "source": {
            "name": "Project Gutenberg",
            "url": f"https://www.gutenberg.org/ebooks/{book['id']}",
            "license": "Public domain in the United States",
        },
        "lessons": entries,
    }
    (book_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{book['slug']}: {len(entries)} lessons, {total} words")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--lang", required=True, choices=sorted({b["lang"] for b in BOOKS}))
    ap.add_argument("--only", help="comma-separated slugs to build; the others are left untouched")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    for book in BOOKS:
        if book["lang"] == args.lang and (only is None or book["slug"] in only):
            build(book, args.raw, args.out)


if __name__ == "__main__":
    main()
