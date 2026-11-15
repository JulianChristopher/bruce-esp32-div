# NewsWire (Dell Research Harvard, CC-BY 4.0): AP and other wire stories as printed in US local papers, 1878-1977.
# For each year 1931-1940 keep, per day, the stories a London paper of the time would carry: British and Irish
# datelines first, then Europe and the Empire, then the largest world stories (by the number of papers that ran them).
import json, os, subprocess, sys, re, collections
RAW = os.path.join(os.path.dirname(__file__), 'raw'); OUT = os.path.join(os.path.dirname(__file__), 'news')
NEAR = {'United Kingdom', 'Ireland', 'England', 'Scotland', 'Wales', 'Northern Ireland'}
EUROPE = {'France', 'Germany', 'Italy', 'Spain', 'Belgium', 'Netherlands', 'Switzerland', 'Austria', 'Poland', 'Czechoslovakia', 'Russia', 'Soviet Union', 'Union of Soviet Socialist Republics', 'Denmark', 'Norway', 'Sweden', 'Finland', 'Hungary', 'Greece', 'Portugal', 'Romania', 'Yugoslavia', 'Vatican City', 'India', 'Canada', 'Australia', 'New Zealand', 'South Africa', 'Egypt', 'Palestine', 'Ethiopia', 'China', 'Japan', 'Turkey'}
MON = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])}
def first_date(s):
    s = " ".join(map(str, s)) if isinstance(s, list) else (s or "")
    m = re.search(r"([A-Z][a-z]{2})-(\d{2})-(\d{4})", s)
    return f"{m.group(3)}-{MON.get(m.group(1), 1):02d}-{m.group(2)}" if m else None
for year in [int(y) for y in sys.argv[1:]]:
    out = os.path.join(OUT, f'{year}.json')
    if os.path.exists(out): print(year, 'done already', flush=True); continue
    raw = os.path.join(RAW, f'{year}.json')
    local = os.path.join(os.path.dirname(__file__), '..', '..', 'news_dl', 'newswire', f'{year}.json')
    src = local if os.path.exists(local) else raw
    if not os.path.exists(src):
        subprocess.run(['curl', '-sS', '-L', '--retry', '6', '-C', '-', '-o', raw, f'https://huggingface.co/datasets/dell-research-harvard/newswire/resolve/main/{year}_data_clean.json'], check=True)
    data = json.load(open(src))
    days = collections.defaultdict(list)
    for a in data:
        d = first_date(a.get('dates'))
        if not d or not d.startswith(str(year)): continue
        country = a.get('wire_country') or ''; text = (a.get('cleaned_article') or a.get('article') or '').strip()
        if len(text) < 120: continue
        size = int(a.get('cluster_size') or 1)
        rank = 3 if country in NEAR or re.search(r'\b(London|England|British|Britain|English)\b', text[:300]) else 2 if country in EUROPE else 1
        days[d].append({'place': a.get('wire_city') or '', 'country': country, 'size': size, 'rank': rank, 'topic': a.get('ca_topic') or '', 'text': re.sub(r'\s+', ' ', text)[:900]})
    keep = {}
    for d, xs in days.items():
        xs.sort(key=lambda x: (-x['rank'], -x['size']))
        keep[d] = xs[:8]
    json.dump(keep, open(out, 'w'))
    print(year, len(data), 'articles,', len(keep), 'days,', sum(len(v) for v in keep.values()), 'kept', flush=True)
    del data
    if src == raw: os.remove(raw)
