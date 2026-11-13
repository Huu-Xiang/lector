# Readfox Report fonts

These subsets of Noto Sans CJK Regular are based on the [Sans2.004 source](https://github.com/notofonts/noto-cjk/tree/523d033d6cb47f4a80c58a35753646f5c3608a78) and renamed for this project. The subsets contain the characters used in report copy and supported translations of the trusted English book catalog. English reports reuse the Simplified Chinese subset for its Latin characters. The Russian subset includes the full Russian alphabet and the nonbreaking space used in number formatting. The PDF generator embeds only the glyphs used in the report.

Copyright © 2014–2021 Adobe. Distributed under the [SIL Open Font License 1.1](OFL.txt).

If report copy or book titles add new characters, download the [pinned font collection](https://raw.githubusercontent.com/notofonts/noto-cjk/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/OTC/NotoSansCJK-Regular.ttc). With FontTools available, run `python3 api/src/assets/vocab-report-fonts/subset.py /path/to/NotoSansCJK-Regular.ttc` from the repository root. The script checks the original font checksum before rebuilding the subsets.
