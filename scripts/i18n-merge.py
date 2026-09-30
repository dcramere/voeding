# merges translation batches ({nl: [en, pt, es]}) into public/i18n/<lang>.json (keeps existing entries)
import json, sys, glob, os
root = os.path.join(os.path.dirname(__file__), "..")
langs = ["en", "pt", "es"]
dicts = {l: json.load(open(f"{root}/public/i18n/{l}.json")) for l in langs}
for f in sorted(sys.argv[1:]):
    for nl, tr in json.load(open(f)).items():
        assert len(tr) == 3, (f, nl)
        for l, t in zip(langs, tr): dicts[l][nl] = t
for l in langs:
    json.dump(dict(sorted(dicts[l].items())), open(f"{root}/public/i18n/{l}.json", "w"), ensure_ascii=False, indent=0)
    print(l, len(dicts[l]))
