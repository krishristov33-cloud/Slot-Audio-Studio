#!/usr/bin/env python3
import pathlib,json,subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile
P=pathlib.Path(__file__).resolve().parent; SR=44100;D=14.0;N=round(D*SR)
rng=np.random.default_rng(572104)
def lp(x,hz):return signal.sosfilt(signal.butter(2,hz,fs=SR,output='sos'),x)
def tone(note,dur,kind):
 t=np.arange(round(dur*SR))/SR;f=440*2**((note-69)/12)
 if kind=='coin':
  x=sum(v*np.sin(2*np.pi*f*r*t+p)*np.exp(-t/tau) for r,v,tau,p in [(1,.6,.034,0),(1.493,.28,.018,.2),(2.071,.17,.009,.4),(2.83,.07,.007,0)])
  x+=lp(rng.normal(size=len(t)),4200)*.08*np.exp(-t/.003)
 elif kind=='bell':
  x=sum(v*np.sin(2*np.pi*f*r*t)*np.exp(-t/tau) for r,v,tau in [(1,.8,.15),(2.005,.17,.07),(3.91,.07,.025)])
 elif kind=='fm':
  x=np.sin(2*np.pi*f*t+2.1*np.exp(-t/.012)*np.sin(2*np.pi*f*1.5*t))*np.exp(-t/.026)
  x+=.34*np.sin(2*np.pi*230*t)*np.exp(-t/.012)
  x+=lp(rng.normal(size=len(t)),2600)*.08*np.exp(-t/.0016)
 elif kind=='rattle':
  x=lp(rng.normal(size=len(t)),4600)*np.exp(-t/.022)*(.6+.4*np.cos(2*np.pi*135*t))
 elif kind=='warm':
  x=sum(np.sin(2*np.pi*f*k*t)/k**2 for k in [1,2,3,4]);x=lp(x,1800)*.5
  x*=np.minimum(t/.2,1)*np.minimum((dur-t)/.35,1)
 elif kind=='impact':
  x=np.sin(2*np.pi*(105*t+1.8*(1-np.exp(-t/.014))))*np.exp(-t/.065)
  x+=.18*lp(rng.normal(size=len(t)),1800)*np.exp(-t/.009)
 # Refined complementary resonator/body shapes, not only equalization.
 if kind=='coin':
  x+=.24*np.sin(2*np.pi*f*.251*t+.65*np.exp(-t/.007))*np.exp(-t/.041)
  x+=.12*np.sin(2*np.pi*310*t)*np.exp(-t/.027)
 elif kind=='fm':
  x=.82*x+.3*np.sin(2*np.pi*285*t+1.6*np.exp(-t/.009)*np.sin(2*np.pi*141*t))*np.exp(-t/.036)
 elif kind=='bell':
  x+=.13*np.sin(2*np.pi*f*.5*t)*np.exp(-t/.12)
 x=lp(x,5100);x*=1-np.exp(-t/.0011)
 z=min(len(x),441);x[-z:]*=np.linspace(1,0,z)
 return np.tanh(x*1.1)*.85

def put(a,sec,note,dur,kind,vol,pan=0):
 x=tone(note,dur,kind)*vol;start=round(sec*SR)
 gains=np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])
 stop=min(N,start+len(x))
 if start>=0 and stop>start:a[start:stop]+=x[:stop-start,None]*gains

def room(a,amount):
 y=a.copy()
 for sec,v in [(.037,.13),(.061,.1),(.109,.055)]:
  k=round(sec*SR);y[k:]+=a[:-k,::-1]*v*amount
 return y
assets={};recipes={}
for label in ['A-classic-payout','B-electronic-tiers','C-harmonic-award']:
 s={k:np.zeros((N,2)) for k in ['count','support','award']}
 if label.startswith('A'):
  pos=.12;i=0
  while pos<9.65:
   u=pos/9.7;rate=15+12*u
   put(s['count'],pos,[79,81,86,83,88,81][i%6],.14,'coin',.36+.12*u,(-.3 if i%2 else .3))
   if i%3==0:put(s['count'],pos+.014,86,.085,'rattle',.075, .18)
   if i%4==0:put(s['support'],pos,[74,77,81,86,81,83][(i//4)%6],.42,'bell',.17,-.18)
   pos+=1/rate;i+=1
  # Short punctuated award cadence, not a continuous loop of melody.
  for sec,n in [(9.8,81),(10.0,86),(10.2,90),(10.45,93)]:put(s['award'],sec,n,.9,'bell',.38,(n-86)/24)
  put(s['award'],10.45,38,.4,'impact',.58)
  recipes[label]={'character':'Layered softened coin taps + rounded bells + tactile micro-rattle','cadence':'15 to 27Hz continuous roll; bell color each fourth event, four punctuated award hits'}
 elif label.startswith('B'):
  for tier,(lo,hi,rate,notes) in enumerate([( .12,3.1,12,[62,69,74]),(3.25,6.35,18,[65,72,77]),(6.5,9.8,25,[69,76,81])]):
   pos=lo;i=0
   while pos<hi:
    put(s['count'],pos,notes[i%3],.13,'fm',.4+tier*.035,(-.1 if i%2 else .1))
    if i%4==0:put(s['count'],pos+.009,notes[0]-12,.08,'fm',.1,0)
    pos+=1/rate;i+=1
   if tier: 
    put(s['support'],lo-.06,notes[-1],.3,'fm',.42,.12)
    put(s['support'],lo-.025,notes[-1]+7,.27,'bell',.15,-.12)
  put(s['award'],10.02,38,.4,'impact',.65)
  for sec,n,v in [(10.02,74,.5),(10.09,81,.25),(10.21,86,.27)]:put(s['award'],sec,n,.6,'fm',v)
  put(s['award'],10.21,90,.9,'bell',.2,.12)
  recipes[label]={'character':'Rounded percussive FM/keyclick and short low-mid body, no carrier drone','cadence':'Held 12/18/25Hz plateaus, short lift accents and deliberate punctuation between tiers; tight total stop'}
 else:
  pos=.12;i=0
  while pos<9.85:
   u=pos/9.7
   put(s['count'],pos,[77,81,86,83][i%4],.16,'coin',.38+.09*u,(-.22 if i%2 else .22))
   if i%2==0:put(s['count'],pos+.012,[74,77,81][i%3],.22,'bell',.11,.12)
   pos+=1/(17+7*u);i+=1
  for sec,ch in [(0,[50,57,62,65]),(2.5,[58,62,65,69]),(5,[62,67,71,76]),(7.5,[65,69,74,81])]:
   for j,n in enumerate(ch):put(s['support'],sec,n,2.9,'warm',.055+sec*.004,(-.5+j/3))
  put(s['award'],10.08,38,.45,'impact',.6)
  for j,n in enumerate([62,66,69,76,86]):
   put(s['award'],10.08+j*.025,n,1.45,'bell',.18 if j<4 else .3,(-.4+j*.2))
  recipes[label]={'character':'Dominant overlapping coin/bell count, warm ascending harmonic voicings beneath, rich single final total','cadence':'17 to 24Hz count across four restrained harmonic swells; no drum kit or bassline'}
 for k in s:
  s[k]=s[k]
  s[k]=signal.sosfilt(signal.butter(2,35,'highpass',fs=SR,output='sos'),s[k],axis=0)
  s[k][:221]*=np.linspace(0,1,221)[:,None];s[k][-8820:]*=np.linspace(1,0,8820)[:,None]
 assets[label]=s
# Dedicated mono low-body groups, independent of high-rate ticks: articulation, not a bassline.
def bodyhit(sec,mode,vol):
 dur=.30 if mode<2 else .38;t=np.arange(round(dur*SR))/SR
 f=[86,76,98][mode]
 phase=2*np.pi*f*t+1.0*(1-np.exp(-t/.012))
 x=(np.sin(phase)+.48*np.sin(2*phase+.2)+.23*np.sin(3*phase))*np.exp(-t/(.052+mode*.008))
 x=np.tanh(x*1.65)*.75*(1-np.exp(-t/.0015))
 x[-441:]*=np.linspace(1,0,441)
 return x*vol

def putbody(a,sec,mode,vol):
 x=bodyhit(sec,mode,vol);i=round(sec*SR);end=min(N,i+len(x));a[i:end]+=x[:end-i,None]/np.sqrt(2)

def spatial(a,idx,award=False):
 # High-passed wet field, damped multi-tap convolution with independent channel delays.
 wet=np.zeros_like(a)
 src=signal.sosfilt(signal.butter(2,390,'highpass',fs=SR,output='sos'),a,axis=0)
 src=signal.sosfilt(signal.butter(2,3900,'lowpass',fs=SR,output='sos'),src,axis=0)
 mono=src.mean(axis=1)
 rt=[.78,.65,1.05][idx]*(1.45 if award else 1)
 for sec,v in [(.027,.16),(.049,.12),(.081,.09)]:
  k=round(sec*SR);wet[k:]+=src[:-k,::-1]*v
 for j in range(64):
  for c in range(2):
   sec=.041+j*.0237+(.0049 if c else 0)+.003*np.sin(j*2.1+c)
   k=round(sec*SR)
   if k>=N:continue
   amp=.065*np.exp(-sec*6.91/rt)
   wet[k:,c]+=mono[:-k]*amp
 # A few diffuse musical-time echoes, well below dry signal.
 for sec,v in [(.167,.045),(.281,.025)]:
  k=round(sec*SR);wet[k:]+=src[:-k,::-1]*v
 return wet
new={}
for idx,(name,s) in enumerate(assets.items()):
 dry=np.tanh(s['count']*2.0)/2.0;body=np.zeros((N,2));support=s['support'];award=s['award']
 if idx==0:
  for sec in np.arange(.12,9.65,.52):putbody(body,float(sec),idx,.28)
 elif idx==1:
  for lo,hi,step in [(.12,3.1,.66),(3.25,6.35,.5),(6.5,9.8,.4)]:
   for sec in np.arange(lo,hi,step):putbody(body,float(sec),idx,.27)
  for sec in [3.19,6.44]:putbody(body,sec,idx,.39)
 else:
  for sec in np.arange(.12,9.85,.58):putbody(body,float(sec),idx,.30)
 final=[10.45,10.02,10.08][idx];putbody(award,final,idx,.8)
 # Late secondary body adds a designed settling thump without long muddy sustain.
 putbody(award,final+.058,idx,.23)
 award*=.42
 space=spatial(dry*.67+support,idx)+spatial(award,idx,True)
 if idx==2:
  space*=np.minimum(np.arange(N)/SR/8,1)[:,None]*.8+.2
 # Explicitly remove low side energy: dry attacks nearly centered, low-body exactly centered.
 parts={'dry-counter':dry,'body':body,'support':support,'space':space,'award':award}
 for k,a in parts.items():
  a=signal.sosfilt(signal.butter(2,32,'highpass',fs=SR,output='sos'),a,axis=0)
  mid=a.mean(axis=1);side=(a[:,0]-a[:,1])*.5
  side=signal.sosfilt(signal.butter(3,300,'highpass',fs=SR,output='sos'),side)
  a=np.column_stack([mid+side,mid-side]);a[-22050:]*=np.linspace(1,0,22050)[:,None]
  parts[k]=a
 new[name]=parts
assets=new
raw={k:sum(s.values()) for k,s in assets.items()}
# Match full-preview v3 RMS; also report active RMS so the longer tail is transparent.
target=10**(-19.576214/20)
levels={k:target/np.sqrt(np.mean(x*x)) for k,x in raw.items()}
peak=max(np.abs(signal.resample_poly(raw[k]*levels[k],4,1,axis=0)).max() for k in raw)
common=min(1,10**(-1.6/20)/peak)
def metrics(q):
 mid=q.mean(axis=1);side=(q[:,0]-q[:,1])*.5
 def band(x,lo,hi):return float(np.mean(signal.sosfilt(signal.butter(3,[lo,hi],'bandpass',fs=SR,output='sos'),x,axis=0)**2))
 lowm=band(mid,65,130);lows=band(side,65,130)
 return {'seconds':len(q)/SR,'sample_peak_dbfs':float(20*np.log10(np.abs(q).max())),'estimated_true_peak_dbtp':float(20*np.log10(np.abs(signal.resample_poly(q,4,1,axis=0)).max())),'rms_dbfs':float(20*np.log10(np.sqrt(np.mean(q*q)))),'active_0_to_10p6_rms_dbfs':float(20*np.log10(np.sqrt(np.mean(q[:467460]**2)))),'dc':q.mean(axis=0).tolist(),'clipped_samples':int((np.abs(q)>=1).sum()),'nonfinite':int((~np.isfinite(q)).sum()),'stereo_correlation':float(np.corrcoef(q.T)[0,1]),'mono_fold_rms_change_db':float(10*np.log10(np.mean(mid*mid)/np.mean(q*q))),'power_65_130':band(q,65,130),'power_150_350':band(q,150,350),'low_band_side_to_mid_db':float(10*np.log10((lows+1e-25)/(lowm+1e-25))),'first_sample':q[0].tolist(),'last_sample':q[-1].tolist(),'last_100ms_peak':float(np.abs(q[-4410:]).max())}
qc={'audibly_auditioned':False,'true_peak_method':'4x polyphase estimate, not certified','common_peak_gain':common,'assets':{}}
for name,s in assets.items():
 g=levels[name]*common;mix=sum(s.values())*g
 wavfile.write(P/(name+'.wav'),SR,np.round(mix*32767).astype(np.int16))
 folder=P/'stems'/name;folder.mkdir(parents=True,exist_ok=True)
 decoded=[]
 for k,a in s.items():
  path=folder/(k+'.wav');wavfile.write(path,SR,np.round(a*g*32767).astype(np.int16));decoded.append(wavfile.read(path)[1].astype(float)/32767)
 q=wavfile.read(P/(name+'.wav'))[1].astype(float)/32767
 old=wavfile.read(P.parent/'approval-demos-v3'/(name+'.wav'))[1].astype(float)/32767
 m=metrics(q);oldm=metrics(old)
 m['v3_comparison']={key:{'v3':oldm[key],'v4':m[key],'power_change_db':float(10*np.log10(m[key]/oldm[key]))} for key in ['power_65_130','power_150_350']}
 m['v3_rms_dbfs']=oldm['rms_dbfs'];m['stem_recombination_max_error']=float(np.abs(sum(decoded)-q).max())
 qc['assets'][name]=m
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(P/(name+'.wav')),'-codec:a','libmp3lame','-b:a','192k',str(P/(name+'.mp3'))],check=True)
(P/'quality-report.json').write_text(json.dumps(qc,indent=2))
(P/'recipes.json').write_text(json.dumps({'seed':572104,'active_presentation_seconds':'A ~10.5, B ~10.3, C ~10.3; total all 14.0 including final decay','format':'stereo 44.1kHz PCM16 + 192kbps MP3','new_layers':'Mono saturated 76–98Hz transient bodies, 2nd/3rd harmonics; coin lower resonator, FM low-mid modulation body, bell subharmonic; high-passed predelayed damped stereo room; richer final weight','spatial':'27/49/81ms early reflections, diffuse 41ms+ taps; RT60 envelope approx .65–1.05s, final award up to 1.52s; wet HP390Hz/LP3900Hz, low sides HP300Hz','arrangements':recipes,'runtime':'One-shot approval previews only, not seamless loops. To make runtime loops separate stationary tier cycles from one-shot lift/award events, wrap all delay/reverb tails or keep a persistent wet bus, and use gain/phase-safe transitions. Current accelerating events and evolving swells must not be reset at endpoints.','comparison':'Full-preview RMS matched against decoded matching v3 master before common peak-safe attenuation; longer tails mean active RMS also reported. No stem normalization.'},indent=2))
print(json.dumps(qc,indent=2))
