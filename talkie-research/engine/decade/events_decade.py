# Dated events 1931-1940 from the Wikipedia pages "YYYY in the United Kingdom" (CC BY-SA 4.0). Written with hindsight:
# used by the engine for dates and institutions only, never put into a prompt as they stand (the papers do that, in
# the words of the time).
import re, json, subprocess, time
MON = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
def clean(t):
    t = re.sub(r'<ref[^>]*/>', '', t); t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'\{\{[^{}]*\}\}', '', t); t = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', t); t = re.sub(r"''+", '', t)
    return re.sub(r'\s+', ' ', t).strip()
out = []
for y in range(1931, 1941):
    url = f'https://en.wikipedia.org/wiki/{y}_in_the_United_Kingdom?action=raw'
    t = subprocess.run(['curl', '-sS', '--max-time', '60', '-A', 'talkie-research/1.0 (historical simulation; research use)', url], capture_output=True, text=True).stdout
    sec = re.search(r'==\s*Events\s*==(.*?)\n==[^=]', t, re.S)
    if not sec: print(y, 'no events section'); time.sleep(3); continue
    month = None; n = 0
    for line in sec.group(1).split('\n'):
        h = re.match(r'===\s*(\w+)\s*===', line)
        if h and h.group(1) in MON: month = MON[h.group(1)]; continue
        m = re.match(r'\*+\s*(.+)', line)
        if not m: continue
        body = m.group(1)
        d = re.match(r"(?:\[\[)?(\d{1,2})(?:[–-]\d{1,2})?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\]\])?\s*[–-]\s*(.+)", body)
        d2 = re.match(r"(?:\[\[)?(January|February|March|April|May|June|July|August|September|October|November|December)(?:\]\])?\s*[–-]\s*(.+)", body)
        if d: date, text = f"{y}-{MON[d.group(2)]:02d}-{int(d.group(1)):02d}", d.group(3)
        elif d2: date, text = f"{y}-{MON[d2.group(1)]:02d}", d2.group(2)
        else: continue
        out.append({'date': date, 'text': clean(text)[:400], 'source': f'https://en.wikipedia.org/wiki/{y}_in_the_United_Kingdom'}); n += 1
    print(y, n, 'events', flush=True); time.sleep(3)
json.dump(out, open('events_wikipedia.json', 'w'), indent=0)
print('total', len(out))
