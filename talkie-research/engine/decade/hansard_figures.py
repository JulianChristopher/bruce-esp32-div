# Monthly official figures as ministers gave them in the House, 1931-1940: the cost-of-living index (per cent above
# July 1914) and the numbers registered as unemployed. Pages found by their titles, the figures read from the answers.
import re, json, subprocess, datetime, html, sys
MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
get=lambda u: subprocess.run(['curl','-sS','--max-time','40',u],capture_output=True,text=True).stdout
out=[]; y0,y1=int(sys.argv[1]),int(sys.argv[2])
d=datetime.date(y0,1,1)
while d<=datetime.date(y1,12,31):
    s=get(f"https://api.parliament.uk/historic-hansard/sittings/{d.year}/{MON[d.month-1]}/{d.day:02d}")
    if 'Commons Sitting of' in s or 'Written Answers' in s:
        for href,title in re.findall(r'href="(/historic-hansard/(?:commons|written[-_]answers)/[^"]+)"[^>]*>\s*([^<]+?)\s*</a>',s):
            t=html.unescape(title)
            if re.search(r'cost.of.living|unemploy(ed|ment).*(figure|statistic|number|return)|insured persons|unemployment',t,re.I):
                p=get('https://api.parliament.uk'+href); txt=html.unescape(re.sub(r'<[^>]+>',' ',p)); txt=re.sub(r'\s+',' ',txt)
                hits=re.findall(r'[^.]{0,200}(?:per cent\. above[^.]{0,40}1914|persons? on the registers?[^.]{0,120}|registered (?:as )?unemployed[^.]{0,120})[^.]{0,120}\.',txt)
                if hits: out.append({'date':d.isoformat(),'title':t,'url':'https://api.parliament.uk'+href,'text':hits[:3]}); print(d,t,flush=True)
    d+=datetime.timedelta(days=1)
json.dump(out,open(f'figures_{y0}_{y1}.json','w'),indent=0)
