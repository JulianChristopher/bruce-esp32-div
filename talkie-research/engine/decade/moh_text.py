# second pass: the OCR text of each collected page (after "Copy text to clipboard") and its tables as CSV
import json, re, html, subprocess
get = lambda u: subprocess.run(['curl', '-sS', '--max-time', '40', u], capture_output=True, text=True).stdout
M = json.load(open('moh_1931_1940.json'))
for r in M:
    for p in r['pages']:
        s = get(p['url'])
        i = s.find('Copy text to clipboard')
        body = s[i:] if i >= 0 else s
        tables = re.findall(r'value="(/moh/service/tables/[^"]+\.csv)"', body)
        t = html.unescape(re.sub(r'<script.*?</script>', ' ', body, flags=re.S)); t = re.sub(r'<[^>]+>', ' ', t); t = re.sub(r'\s+', ' ', t)
        t = t.replace('Copy text to clipboard', '').split(' Download table as:')[0] if 'Table:' not in t[:200] else t
        p['text'] = t[:8000]
        p['tables'] = []
        for u in tables[:4]:
            u = u if u.startswith('http') else 'https://wellcomelibrary.org' + u
            p['tables'].append({'url': u, 'csv': get(u)[:6000]})
    print(r['place'], r['year'], flush=True)
json.dump(M, open('moh_1931_1940.json', 'w'))
