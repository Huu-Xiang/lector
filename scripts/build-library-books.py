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
    dict(lang="fr", slug="fables-de-la-fontaine", id=56327, title="Fables de La Fontaine (extraits)",
         author="Jean de La Fontaine", level="B2", start=r"LA CIGALE ET LA FOURMI", short="Fables",
         verse=True, max_words=14000),
    dict(lang="fr", slug="trois-contes", id=12065, title="Trois contes", author="Gustave Flaubert",
         level="C1", start=r"Pendant un demi-siècle", short="Trois contes"),
    dict(lang="fr", slug="madame-bovary", id=14155, title="Madame Bovary (début)", author="Gustave Flaubert",
         level="C1", start=r"^PREMIÈRE PARTIE\s*$", short="Madame Bovary", max_words=35000),
    dict(lang="fr", slug="germinal", id=5711, title="Germinal (début)", author="Émile Zola",
         level="C1", start=r"^Première Partie\s*$", short="Germinal", max_words=35000,
         subs=[(r"^(Première|Deuxième|Troisième) Partie[ \t]*$", lambda m: m[0].upper())]),
    dict(lang="fr", slug="du-cote-de-chez-swann", id=2650, title="Du côté de chez Swann (Combray, début)",
         author="Marcel Proust", level="C2", start=r"Longtemps, je me suis couché", short="Combray",
         stop=r"^II\.\s*$"),
    dict(lang="fr", slug="le-pere-goriot", id=55860, title="Le Père Goriot (début)", author="Honoré de Balzac",
         level="C2", start=r"^Madame Vauquer, née de Conflans", short="Le Père Goriot", max_words=35000,
         subs=[(r"(?s)\[Illustration:.*?\]", "")]),
    dict(lang="fr", slug="notre-dame-de-paris", id=19657, title="Notre-Dame de Paris (début)", author="Victor Hugo",
         level="C2", start=r"^LIVRE PREMIER\s*$", short="Notre-Dame de Paris", max_words=35000),
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
    dict(lang="fr", slug="le-petit-chose", id=13256, title="Le Petit Chose (début)", author="Alphonse Daudet",
         level="B1", start=r"^I\s*\n\s*\nLA FABRIQUE", short="Le Petit Chose", max_words=35000,
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
    dict(lang="en", slug="aesops-fables", id=11339, title="Aesop's Fables (selection)",
         author="Aesop, translated by V. S. Vernon Jones", level="A2",
         start=r"THE FOX AND THE GRAPES\s*\n\s*\n(?!\s*THE GOOSE)", short="Aesop's Fables", max_words=14000),
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
    dict(lang="en", slug="jane-eyre", id=1260, title="Jane Eyre (Chapters 1–10)",
         author="Charlotte Brontë", level="C1", start=r"^CHAPTER I\s*$", short="Jane Eyre",
         stop=r"^CHAPTER XI\s*$", subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
    dict(lang="en", slug="great-expectations", id=1400, title="Great Expectations (Chapters 1–11)",
         author="Charles Dickens", level="C2", start=r"^Chapter I\.\s*$", short="Great Expectations",
         stop=r"^Chapter XII\.\s*$"),
    dict(lang="en", slug="wuthering-heights", id=768, title="Wuthering Heights (Chapters 1–10)",
         author="Emily Brontë", level="C2", start=r"^CHAPTER I\s*$", short="Wuthering Heights",
         stop=r"^CHAPTER XI\s*$", subs=[(r"^CHAPTER ([IVXL]+)[ \t]*$", r"Chapter \1")]),
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
    return bool(ROMAN.match(plain)) or (len(plain) > 2 and plain == plain.upper() and re.search(r"[A-ZÀ-Ý]", plain)) \
        or bool(re.match(r"^(CHAPITRE|Chapitre|CHAPTER|Chapter)\b", plain))


def paragraphs(text: str, verse: bool) -> list[str]:
    out: list[str] = []
    for chunk in re.split(r"\n\s*\n", text):
        par = clean_paragraph(chunk, verse)
        if par:
            out.append(par)
    merged: list[str] = []
    for par in out:
        if merged and is_heading(par) and ROMAN.match(merged[-1].strip(" _*.")):
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
        return f"{m[1]}. {title_case(m[2])}" if m else title_case(t.rstrip("."))
    if names is not None and t.isupper():
        m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
        return f"{m[1]}. {sentence_case(m[2], names)}" if m else sentence_case(t, names)
    if capitalise and t.isupper():
        return _keep_roman(_capitalise_words(t))
    m = re.match(r"^([IVXLC]+)\.\s+(.*)$", t)
    if m:
        rest = _keep_roman(_sentence(m.group(2))) if m.group(2).isupper() else m.group(2)
        return f"{m.group(1)}. {rest}"
    return _keep_roman(_sentence(t)) if t.isupper() else t


def build(book: dict, raw_dir: Path, out_dir: Path) -> None:
    raw = (raw_dir / f"pg{book['id']}.txt").read_text(encoding="utf8", errors="replace")
    if book.get("extractor") == "premier_livre":
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
