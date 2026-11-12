"""Build the four checked-in Readfox Report fonts from Noto Sans CJK Regular."""
from hashlib import sha256
import json
from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTCollection


SOURCE_SHA256 = "b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a"
FACE_LOCALES = ("ja", "ko", "zh-CN", "zh-TW")
CATALOG_KEYS = ("estimate", "estimateRange", "estimateCapped", "level", "explain", "booksTitle")

out_dir = Path(__file__).resolve().parent
root = out_dir.parents[3]
lib = out_dir.parents[1] / "lib"
library = root / "languages/en/content/library"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def source_text():
    parts = ["".join(map(chr, range(32, 127))), "± · • … 年月日년월일"]
    copy = read_json(lib / "vocab-test-report-copy.json")
    titles = read_json(library / "translations.json")
    for locale, strings in copy.items():
        catalog = read_json(root / "messages/src" / locale / "vocabtest.json")["vocabTest"]
        parts.extend(strings.values())
        parts.extend(catalog[key] for key in CATALOG_KEYS)
        parts.extend(record["title"].get(locale, "") for record in titles.values())
    parts.extend(read_json(path)["title"] for path in library.glob("*/manifest.json"))
    return {ord(char) for char in "".join(parts)}


def save_face(font, locale, codepoints):
    missing = codepoints - font.getBestCmap().keys()
    if missing:
        raise ValueError(f"{locale}: source font is missing {''.join(map(chr, sorted(missing)))}")

    options = subset.Options()
    options.recalc_timestamp = False
    options.name_IDs = list(range(18))
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    family = f"Readfox Report {locale}"
    postscript = f"ReadfoxReport-{locale}"
    for name in font["name"].names:
        value = {
            1: family,
            3: postscript,
            4: family,
            6: postscript,
            16: family,
        }.get(name.nameID)
        if value:
            name.string = value.encode(name.getEncoding())

    cff = font["CFF "].cff
    cff.fontNames[0] = postscript
    cff.topDictIndex[0].FamilyName = family
    cff.topDictIndex[0].FullName = family
    font.save(out_dir / f"{locale}.otf")


def main():
    source = Path(sys.argv[1])
    if sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("Expected Noto Sans CJK Regular from Sans2.004")
    fonts = TTCollection(source, lazy=True)
    codepoints = source_text()
    for index, locale in enumerate(FACE_LOCALES):
        save_face(fonts.fonts[index], locale, codepoints)


if __name__ == "__main__":
    main()
