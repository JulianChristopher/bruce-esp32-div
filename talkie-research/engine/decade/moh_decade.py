# Medical Officer of Health reports 1931-1940 (Wellcome Collection, "London's Pulse", CC-BY): pages of the Bermondsey,
# Islington and London County Council reports that speak of the death-rate, infant mortality, influenza, epidemics,
# overcrowding, and the war (evacuation, air raids); their text is kept for each year with its link.
import re, json, subprocess, html, time
def get(u): return subprocess.run(['curl', '-sS', '--max-time', '40', u], capture_output=True, text=True).stdout
def search(terms, place):
    h = subprocess.run(['curl', '-sS', '--max-time', '40', '-D', '-', '-o', '/dev/null', '-X', 'POST', 'https://wellcomelibrary.org/moh/buildsearch/', '--data', f'terms={terms}&place={place}&year-from=1931&year-to=1940'], capture_output=True, text=True).stdout
    loc = re.search(r'location: (\S+)', h, re.I)
    if not loc: return ''
    return get('https://wellcomelibrary.org' + loc.group(1))
def page_text(u):
    s = get(u); t = html.unescape(re.sub(r'<[^>]+>', ' ', s)); t = re.sub(r'\s+', ' ', t)
    i = t.find('View report tables'); return t[i:i + 6000] if i >= 0 else t[:6000]
out = {}
for place in ['Bermondsey', 'Islington', 'London County Council']:
    for terms in ['death-rate', 'infant mortality', 'influenza', 'epidemic', 'overcrowding', 'evacuation', 'air raid', 'measles', 'diphtheria', 'tuberculosis']:
        s = search(terms.replace(' ', '+'), place.replace(' ', '+'))
        # result blocks: report title with year, then page links
        for rid, pg in set(re.findall(r'moh/report/(b\d{8})/(\d+)#', s)):
            key = (place, rid)
            if key not in out: out[key] = {'place': place, 'report': rid, 'pages': {}}
            out[key]['pages'].setdefault(pg, set()).add(terms)
        time.sleep(1)
    print(place, 'reports', len([k for k in out if k[0] == place]), flush=True)
# titles (year) and page text
res = []
for (place, rid), v in out.items():
    first = get(f'https://wellcomelibrary.org/moh/report/{rid}'); m = re.search(r'for the year (19\d\d)', first) or re.search(r'(19[34]\d)', first)
    year = m.group(1) if m else None
    item = {'place': place, 'report': rid, 'year': year, 'url': f'https://wellcomelibrary.org/moh/report/{rid}', 'pages': []}
    for pg, terms in sorted(v['pages'].items(), key=lambda x: int(x[0]))[:14]:
        item['pages'].append({'page': int(pg), 'terms': sorted(terms), 'url': f'https://wellcomelibrary.org/moh/report/{rid}/{pg}', 'text': page_text(f'https://wellcomelibrary.org/moh/report/{rid}/{pg}')})
    res.append(item); print(place, year, rid, len(item['pages']), flush=True)
json.dump(res, open('moh_1931_1940.json', 'w'))
