# Polish Core 3000 data notes

The bundled `src/data/polish-core-3000.json` is a learning-oriented derived word list.

- Frequency ordering starts from the Polish lemmatized OpenSubtitles frequency list in `bnpd/freqListsLemmatized` (CC BY-SA 4.0), itself based on subtitle frequency data. The source explicitly warns that automatically lemmatized frequency lists may contain typos, slang, offensive words, and lemmatization errors.
- Polish headwords and English glosses are cross-checked against a Polish-English Wiktionary extraction (`Vuizur/Wiktionary-Dictionaries`).
- Common/high-frequency Korean meanings are manually curated in the generator. Remaining Korean glosses include automatic English→Korean dictionary matching, with the source English definition retained in each word's `note` where available so questionable mappings can be checked while studying.
- The app treats the list as a study deck, not as a normative Polish dictionary. Individual meanings can be edited in Reword without changing the deck installer.

Useful upstream references:

- https://github.com/bnpd/freqListsLemmatized
- https://github.com/Vuizur/Wiktionary-Dictionaries
- https://github.com/kakaobrain/word2word
