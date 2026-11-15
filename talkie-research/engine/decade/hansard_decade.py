import re, json, subprocess, datetime, html
MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
out={}
import sys
d=datetime.date(int(sys.argv[1]),1,1)
end=datetime.date(int(sys.argv[2]),12,31)
while d<=end:
    u=f"https://api.parliament.uk/historic-hansard/sittings/{d.year}/{MON[d.month-1]}/{d.day:02d}"
    s=subprocess.run(['curl','-sS','--max-time','40',u],capture_output=True,text=True).stdout
    if 'Commons Sitting of' in s:
        c=s.split('Commons Sitting of',1)[1].split('Written Answers',1)[0].split('Lords Sitting',1)[0]
        items=re.findall(r'<a[^>]*href="(/historic-hansard/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>\s*</span>\s*<span class="[^"]*">\s*([\d,]+) words',c)
        if not items: items=re.findall(r'href="(/historic-hansard/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>[\s\S]{0,200}?([\d,]+) words',c)
        deb=[(html.unescape(t).strip().rstrip('.').title(),int(w.replace(',',''))) for _,t,w in items]
        deb=[x for x in deb if not re.match(r'(Preamble|Private Business|Orders Of The Day|Business Of The House|Adjournment|New Member|Clause|Schedule|Motion|Resolution|Message From)',x[0])]
        deb.sort(key=lambda x:-x[1])
        out[d.isoformat()]=deb[:6]
        print(d, len(deb), flush=True)
    d+=datetime.timedelta(days=1)
json.dump(out,open(f'hansard_{sys.argv[1]}_{sys.argv[2]}.json','w'))
