#!/usr/bin/env python3
"""Original deterministic synthesis; no samples, MIDI library or external audio services."""
import json, pathlib, subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile
P=pathlib.Path(__file__).resolve().parent
SR=44100; BPM=112; BEAT=60/BPM; N=756000
rng=np.random.default_rng(41219)
recipe={'title':'Hollow Orchard','direction':'Initial hypothesis: playful-dark tactile electronic / organic hybrid','bpm':BPM,'sample_rate':SR,'bars':8,'meter':'4/4','key':'D minor, Dorian B-natural color','seed':41219,'chords':['Dm(add9)','Dm(add9)','Bbmaj7','Bbmaj7','G6/D (Dorian)','G6/D (Dorian)','Am7','Dm6/9'],'patches':{'wood':'inharmonic decaying resonator partials, filtered felt noise attack, soft saturation','rubber':'triangle/saw blend, falling pitch envelope, low-pass resonant coloration','bass':'rounded triangle plus fundamental, low-pass, mono','air':'band-limited noise with slow amplitude modulation','drums':'pitch-decay kick, filtered noise / resonator rim, short noisy hats'},'loop_processing':'Circular event tails and circular multi-tap room/delay; no endpoint fades. Each loop is a periodic signal.','gain':'One global gain shared by all assets and stems; no limiter'}
(P/'recipe.json').write_text(json.dumps(recipe,indent=2))
def filt(x, hz, kind='lowpass'):
 return signal.sosfilt(signal.butter(2,hz,kind,fs=SR,output='sos'),x)
def patch(note, dur, typ):
 t=np.arange(int(dur*SR))/SR; f=440*2**((note-69)/12)
 if typ=='wood':
  x=sum(a*np.sin(2*np.pi*f*r*t)*np.exp(-t/d) for a,r,d in [(1,1,.27),(.32,2.013,.12),(.16,3.96,.065),(.08,6.17,.025)])
  x+=filt(rng.normal(size=len(t)),2400)*.16*np.exp(-t/.012)
  x=np.tanh(x*1.25)*.7*(1-np.exp(-t/.002))
 elif typ=='rubber':
  phase=2*np.pi*f*(t+.0007*(1-np.exp(-t/.025)))
  x=sum(np.sin(k*phase)/k**2 for k in [1,2,3,4,5]); x=filt(x,2100)*np.exp(-t/.19)*(1-np.exp(-t/.004))
 elif typ=='bass':
  x=(np.sin(2*np.pi*f*t)+.2*np.sin(2*np.pi*f*2*t)+.09*np.sin(2*np.pi*f*3*t))*.7
  x*=np.minimum(t/.009,1)*np.minimum(np.maximum(dur-t,0)/.06,1); x=filt(x,650)
 elif typ=='pad':
  x=sum(np.sin(2*np.pi*f*r*t+ph)*a for r,a,ph in [(1,.6,0),(2.001,.11,.4),(.998,.22,.2)])
  x=filt(x,1500)*np.minimum(t/.25,1)*np.minimum((dur-t)/.45,1)*.22
 elif typ=='kick':
  x=np.sin(2*np.pi*(48*t+2.0*(1-np.exp(-t/.024))))*np.exp(-t/.085)
  x+=filt(rng.normal(size=len(t)),2500)*.12*np.exp(-t/.005)
 elif typ=='rim':
  x=(np.sin(2*np.pi*1760*t)*.5+np.sin(2*np.pi*940*t)*.4)*np.exp(-t/.016)
  x+=filt(rng.normal(size=len(t)),1800,'highpass')*.4*np.exp(-t/.028)
 elif typ=='hat':
  x=filt(rng.normal(size=len(t)),6500,'highpass')*np.exp(-t/.018)*.38
 else: raise ValueError(typ)
 # Tail taper only on each individual voice, not the loop boundary.
 end=min(len(x),int(.012*SR)); x[-end:]*=np.linspace(1,0,end)
 return x

def add(a, beat, note, dur, typ, amp, pan=0, human=True, circular=True):
 start=int(round((beat*BEAT+(rng.uniform(-.003,.003) if human else 0))*SR))
 x=patch(note,dur,typ)*amp*(rng.uniform(.94,1.05) if human else 1)
 gains=np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])
 ix=np.arange(len(x))+start
 if circular:
  for c in range(2): np.add.at(a[:,c],ix%len(a),x*gains[c])
 else:
  ok=(ix>=0)&(ix<len(a)); a[ix[ok]]+=x[ok,None]*gains

def fx(a, amount, circular=True):
 y=a.copy()
 for delay,g,p in [(.071,.14,True),(.113,.11,False),(.187,.075,True),(BEAT*.75,.16,True),(BEAT*1.5,.07,False)]:
  k=int(delay*SR); b=a[:,::-1] if p else a
  if circular: y+=np.roll(b,k,axis=0)*g*amount
  else: y[k:]+=b[:-k]*g*amount
 return y

def loop(bonus):
 names=['mallets','pluck','bass','harmony','drums','texture']
 s={k:np.zeros((N,2),np.float64) for k in names}
 # Two-bar call and response, varied at cadences rather than straight arpeggiation.
 motifs=[[(0,74,.85),(.75,77,.63),(1.5,81,.74),(2.75,76,.55),(3.25,74,.68)],[(.5,72,.65),(1.25,69,.57),(2.5,76,.72),(3.5,74,.5)],[(0,74,.8),(.75,77,.6),(1.75,81,.7),(2.75,79,.6)],[(.5,77,.64),(1.25,76,.5),(2.5,72,.7),(3.25,69,.5)],[(0,74,.8),(.75,77,.6),(1.5,83,.58),(2.75,81,.65)],[(.5,79,.63),(1.25,76,.5),(2.5,74,.7)],[(0,76,.7),(.75,79,.6),(1.5,81,.7),(2.75,72,.65)],[(.25,77,.65),(1,76,.5),(2,74,.8)]]
 roots=[38,38,34,34,43,43,33,38]
 chords=[[62,65,69,76]]*2+[[58,62,65,69]]*2+[[62,67,71,76]]*2+[[57,60,64,67],[62,65,71,76]]
 for bar in range(8):
  b=bar*4
  for off,n,v in motifs[bar]: add(s['mallets'],b+off,n,.8,'wood',v*.24, -.3)
  for off,n,v in [(1.0,motifs[bar][0][1]-12,.7),(2.25,motifs[bar][-1][1]-12,.6),(3.65,69 if bar<6 else 72,.45)]:
   if bar==7 and off>3: continue
   add(s['pluck'],b+off,n,.7,'rubber',v*.24,.32)
  if bonus:
   for j,(off,n) in enumerate([(.5,86),(1.75,89 if bar<4 else 83),(3,88 if bar%2==0 else 86)]):
    if bar==7 and off>2: continue
    add(s['pluck'],b+off,n,.5,'wood',.075,.45 if j%2 else -.45)
  for off,d,v in [(0,.68,.32),(1.75,.27,.23),(2.5,.47,.28)]: add(s['bass'],b+off,roots[bar],d,'bass',v,0)
  if bar%2: add(s['bass'],b+3.5,roots[bar]+(7 if bar!=7 else 12),.22,'bass',.18,0)
  for j,n in enumerate(chords[bar]): add(s['harmony'],b,n,BEAT*4+.5,'pad',.26,(-.65+j*.43))
  for off in ([0,1.5,2.75] if bonus else [0,2.5]): add(s['drums'],b+off,0,.35,'kick',.45,0,False)
  for off in [1,3]: add(s['drums'],b+off,0,.13,'rim',.19,.08)
  for j in range(8 if bonus else 4):
   off=j*(.5 if bonus else 1)+.25
   add(s['drums'],b+off,0,.1,'hat',(.22 if j%2 else .3),(-.38 if j%2 else .38))
  if bonus and bar in [3,7]:
   for off in [3.25,3.5,3.75]: add(s['drums'],b+off,0,.12,'rim',.07,-.25)
 # Periodic dust: noise smoothly modulated; circular filtering in frequency domain.
 z=rng.normal(size=N); F=np.fft.rfft(z); hz=np.fft.rfftfreq(N,1/SR)
 F*=np.exp(-((hz-3200)/2200)**2); air=np.fft.irfft(F,n=N)
 t=np.arange(N)/N; air*=.006*(.65+.35*np.sin(2*np.pi*t*4))
 s['texture'][:,0]=air; s['texture'][:,1]=np.roll(air,617)
 for k in ['mallets','pluck','harmony']: s[k]=fx(s[k],.8 if k!='harmony' else .55)
 s['drums']=fx(s['drums'],.12)
 for k in s: s[k]-=s[k].mean(axis=0)
 return s

def sting():
 n=int(4.0*SR); s={k:np.zeros((n,2)) for k in ['mallets','pluck','bass','harmony','drums']}
 for b,note,v in [(0,74,.27),(.25,77,.22),(.75,81,.24),(1,83,.18),(1.5,86,.3)]: add(s['mallets'],b,note,1.1,'wood',v,-.2,False,False)
 for b,note in [(0,62),(.75,69),(1.5,78)]: add(s['pluck'],b,note,1.2,'rubber',.18,.3,False,False)
 for note in [62,66,69,76]: add(s['harmony'],1.5,note,2.4,'pad',.4,(note-69)/18,False,False)
 add(s['bass'],0,38,.6,'bass',.3,0,False,False);add(s['bass'],1.5,38,1.5,'bass',.3,0,False,False)
 add(s['drums'],0,0,.35,'kick',.4,0,False,False);add(s['drums'],1.5,0,.35,'kick',.35,0,False,False)
 for k in ['mallets','pluck','harmony']: s[k]=fx(s[k],.65,False)
 for k in s: s[k][-6615:]*=np.linspace(1,0,6615)[:,None]
 return s
assets={'base_game_loop':loop(False),'bonus_loop':loop(True),'win_sting':sting()}
# Check oversampled peaks before choosing a shared gain.
peak=max(np.max(np.abs(signal.resample_poly(sum(s.values()),4,1,axis=0))) for s in assets.values())
gain=10**(-2/20)/peak
report={'audibly_auditioned':False,'true_peak_method':'4x polyphase oversampling (estimate, not certified meter)','common_gain':gain,'assets':{}}
def write(path,x):
 wavfile.write(path,SR,np.round(np.clip(x,-1,1)*32767).astype(np.int16))
for name,stems in assets.items():
 folder=P/'stems'/name;folder.mkdir(parents=True,exist_ok=True)
 mix=sum(stems.values())*gain; path=P/(name+'.wav');write(path,mix)
 decoded=[]
 for k,v in stems.items():
  write(folder/(k+'.wav'),v*gain)
  decoded.append(wavfile.read(folder/(k+'.wav'))[1].astype(float)/32767)
 q=wavfile.read(path)[1].astype(float)/32767
 diff=np.diff(q,axis=0); jump=q[0]-q[-1]
 w=441
 seam=np.vstack([q[-w:],q[:w]])
 m={'frames':len(q),'seconds':len(q)/SR,'bars':8 if 'loop' in name else None,'sample_peak':float(np.max(np.abs(q))),'sample_peak_dbfs':float(20*np.log10(np.max(np.abs(q)))),'true_peak_estimate_dbtp':float(20*np.log10(np.max(np.abs(signal.resample_poly(q,4,1,axis=0))))),'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(q*q)))),'dc_per_channel':np.mean(q,axis=0).tolist(),'nonfinite':int(np.sum(~np.isfinite(q))),'clipped_samples':int(np.sum(np.abs(q)>=1)),'stem_recombination_max_error':float(np.max(np.abs(sum(decoded)-q)))}
 if 'loop' in name:
  m.update({'boundary_jump_per_channel':jump.tolist(),'adjacent_diff_rms':float(np.sqrt(np.mean(diff**2))),'adjacent_diff_99_percentile':float(np.quantile(np.abs(diff),.99)),'seam_20ms_diff_rms':float(np.sqrt(np.mean(np.diff(seam,axis=0)**2))),'pre_seam_10ms_rms':float(np.sqrt(np.mean(q[-w:]**2))),'post_seam_10ms_rms':float(np.sqrt(np.mean(q[:w]**2)))})
 report['assets'][name]=m
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(path),'-codec:a','libmp3lame','-b:a','192k',str(P/(name+'.mp3'))],check=True)
(P/'quality-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
