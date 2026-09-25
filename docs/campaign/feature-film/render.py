"""Render a 32-second ClutterDock product film from authentic app captures.

Requires Python, Pillow, NumPy, and ffmpeg. No network or screen-control code.
Run from any directory: python3 docs/campaign/feature-film/render.py
Use --stills for a quick layout review. Outputs are under output/feature-film/.
"""
from pathlib import Path
import argparse
import math
import os
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSETS = HERE / "assets"
OUT = Path(os.environ.get("CLUTTERDOCK_FILM_OUTPUT", ROOT / "output/feature-film"))
OUT.mkdir(parents=True, exist_ok=True)
W, H, FPS, DURATION = 1920, 1080, 30, 32
INK, BLUE, MUTED = "#17233c", "#2864ee", "#68758b"
WHITE = "#f5f8ff"
BOUNDS = [0, 4, 8.5, 12.5, 18, 23, 27, 32]
FONT_DIR = Path("/System/Library/Fonts/Supplemental")
FONTS = {}

def font(size, bold=False):
    key = size, bold
    if key not in FONTS:
        filename = "Arial Bold.ttf" if bold else "Arial.ttf"
        FONTS[key] = ImageFont.truetype(str(FONT_DIR / filename), size)
    return FONTS[key]

def ease(value):
    value = max(0, min(1, value))
    return 1 - (1 - value) ** 4

def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)

def text_layer(text, size, fill=INK, bold=False, tracking=0):
    f = font(size, bold)
    box = f.getbbox(text)
    width = math.ceil(f.getlength(text) + max(0, len(text)-1)*tracking)
    layer = Image.new("RGBA", (width + 10, size * 2))
    d = ImageDraw.Draw(layer)
    if not tracking:
        d.text((5, -box[1]), text, font=f, fill=fill)
    else:
        x = 5
        for char in text:
            d.text((x, -box[1]), char, font=f, fill=fill)
            x += f.getlength(char) + tracking
    return layer.crop((0, 0, width+10, box[3]-box[1]+3))

TEXT = {}
def title(canvas, text, x, y, size, fill=INK, bold=False, alpha=1, center=False, tracking=0):
    key = text, size, fill, bold, tracking
    if key not in TEXT:
        TEXT[key] = text_layer(text, size, fill, bold, tracking)
    layer = TEXT[key]
    if alpha < .999:
        layer = layer.copy()
        layer.putalpha(layer.getchannel("A").point(lambda v: round(v*max(0,alpha))))
    canvas.alpha_composite(layer, (round(x-layer.width/2 if center else x), round(y)))

def background(dark=False):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if dark:
        base = np.zeros((H,W,3), np.float32) + [10, 16, 31]
        glow = np.exp(-(((xx-1320)/780)**2+((yy-640)/600)**2))
        base += glow[...,None]*np.array([7, 20, 49])
    else:
        base = np.zeros((H,W,3), np.float32) + [249, 250, 253]
        glow = np.exp(-(((xx-1280)/880)**2+((yy-700)/590)**2))
        base -= glow[...,None]*np.array([25, 17, 4])
    return Image.fromarray(np.uint8(np.clip(base,0,255))).convert("RGBA")

LIGHT, DARK = background(), background(True)
IMAGES = {}
for filename in ["apps", "search-cl", "search-clock", "list", "cd-signature"]:
    image = Image.open(ASSETS / (filename+".png")).convert("RGBA")
    if filename != "cd-signature":
        # Presentation mask follows the real panel's rounded window boundary.
        mask = Image.new("L", image.size)
        ImageDraw.Draw(mask).rounded_rectangle((0,0,image.width-1,image.height-1), radius=48, fill=255)
        image.putalpha(mask)
    IMAGES[filename] = image

SHADOWS = {}
def picture(canvas, name, x, y, width, alpha=1, shadow=True):
    original = IMAGES[name]
    width = round(width)
    height = round(width*original.height/original.width)
    if shadow:
        # Quantized shadow sizes avoid rebuilding the blur on every frame.
        sw = round(width/16)*16
        sh = round(sw*original.height/original.width)
        key = name, sw
        if key not in SHADOWS:
            s = Image.new("RGBA", (sw+160,sh+160))
            ImageDraw.Draw(s).rounded_rectangle((80,80,sw+80,sh+80),radius=sw*.055,fill=(15,31,65,48))
            SHADOWS[key] = s.filter(ImageFilter.GaussianBlur(32))
        s = SHADOWS[key]
        if alpha < .999:
            s=s.copy();s.putalpha(s.getchannel("A").point(lambda v:round(v*max(0,alpha))))
        canvas.alpha_composite(s,(round(x-80),round(y-58)))
    layer=original.resize((width,height),Image.Resampling.LANCZOS)
    if alpha < .999:
        layer.putalpha(layer.getchannel("A").point(lambda v:round(v*max(0,alpha))))
    canvas.alpha_composite(layer,(round(x),round(y)))

def pill(canvas, label, cx, y, width, alpha=1, dark=False):
    layer=Image.new("RGBA",(width,62))
    d=ImageDraw.Draw(layer)
    d.rounded_rectangle((0,0,width-1,61),radius=31,fill=(32,63,114,255) if dark else (229,237,252,255))
    title(layer,label,width/2,20,22,WHITE if dark else BLUE,center=True)
    if alpha<.999:layer.putalpha(layer.getchannel("A").point(lambda v:round(v*max(0,alpha))))
    canvas.alpha_composite(layer,(round(cx-width/2),round(y)))

def keycap(canvas, label, x, y, width=110, active=False):
    d=ImageDraw.Draw(canvas)
    d.rounded_rectangle((x,y+6,x+width,y+102),18,fill="#d4deef")
    d.rounded_rectangle((x,y,x+width,y+94),18,fill=BLUE if active else "#ffffff",outline="#dce4f1",width=2)
    # System font preserves the native command/shift symbols.
    f=ImageFont.truetype("/System/Library/Fonts/SFNS.ttf",42)
    box=d.textbbox((0,0),label,font=f)
    d.text((x+width/2-(box[2]-box[0])/2,y+44-(box[3]-box[1])/2-box[1]),label,font=f,fill="white" if active else INK)

def scene(index,t):
    duration=BOUNDS[index+1]-BOUNDS[index]
    e=ease(t/.9)
    if index==0:
        c=DARK.copy();d=ImageDraw.Draw(c)
        # Abstract framing geometry, separate from product imagery.
        for i in range(3):
            x=1210+i*46+40*(1-ease(t/2));y=300+i*52
            d.rounded_rectangle((x,y,x+320,y+320),55,outline=(43,65+i*8,112+i*14,255),width=2)
        title(c,"CLUTTERDOCK",140,155,23,"#9bb4e4",True,alpha=e,tracking=5)
        title(c,"Less hunting.",135,355+35*(1-e),132,WHITE,True,alpha=e)
        second=ease((t-.85)/.85)
        title(c,"More doing.",135,520+30*(1-second),132,"#76a6ff",True,alpha=second)
        title(c,"A little more room to focus.",143,750,33,"#9cabc4",alpha=ease((t-1.6)/.8))
        return c
    if index==1:
        c=LIGHT.copy()
        title(c,"PRISM FOR MAC",960,120,22,BLUE,True,center=True,tracking=4,alpha=e)
        title(c,"Meet ClutterDock.",960,189,96,INK,True,center=True,alpha=e)
        width=1040+25*smooth(t/duration)
        picture(c,"apps",960-width/2,355+85*(1-e),width,alpha=e)
        title(c,"Your everyday tools. Together in one place.",960,995,29,MUTED,center=True,alpha=ease((t-.6)/.7))
        return c
    if index==2:
        c=LIGHT.copy()
        title(c,"ALWAYS WITHIN REACH",145,230,21,BLUE,True,tracking=3,alpha=e)
        title(c,"One shortcut.",140,319+30*(1-e),84,INK,True,alpha=e)
        title(c,"Everything close.",140,424+30*(1-e),84,INK,True,alpha=e)
        for i,letter in enumerate(["⌘","⇧","D"]):
            if t>.3+i*.15:keycap(c,letter,150+i*134,585,active=.8<t<1.75)
        title(c,"Apps, files, folders and links.",146,748,28,MUTED,alpha=ease((t-.65)/.7))
        picture(c,"apps",940+90*(1-e),310,910,alpha=e)
        return c
    if index==3:
        c=DARK.copy()
        title(c,"Find it as you type.",960,135,96,WHITE,True,center=True,alpha=e)
        name="apps" if t<1.05 else "search-cl" if t<1.8 else "search-clock"
        width=1085+20*smooth(t/duration)
        picture(c,name,960-width/2,305+40*(1-e),width,alpha=e,shadow=False)
        title(c,"Less searching. Straight to your next tool.",960,992,28,"#a6b6d0",center=True,alpha=ease((t-2)/.7))
        return c
    if index==4:
        c=LIGHT.copy()
        title(c,"Your view. Your rhythm.",960,125,91,INK,True,center=True,alpha=e)
        title(c,"Switch between grid and list.",960,247,30,MUTED,center=True,alpha=e)
        picture(c,"apps",170-80*(1-e),388,760,alpha=e)
        e2=ease((t-.25)/.9)
        picture(c,"list",1060+80*(1-e2),341,670,alpha=e2)
        title(c,"GRID",550,892,20,BLUE,True,center=True,tracking=3,alpha=e)
        title(c,"LIST",1395,892,20,BLUE,True,center=True,tracking=3,alpha=e2)
        return c
    if index==5:
        c=DARK.copy()
        title(c,"YOUR DESKTOP IS YOURS",960,205,22,"#9bb4e4",True,center=True,tracking=4,alpha=e)
        title(c,"On your Mac.",960,339+25*(1-e),116,WHITE,True,center=True,alpha=e)
        title(c,"In your control.",960,486+25*(1-e),116,"#76a6ff",True,center=True,alpha=e)
        p=ease((t-.65)/.7)
        pill(c,"Your stacks stay local",725,719,360,p,True)
        pill(c,"No account required",1195,719,355,p,True)
        return c
    c=LIGHT.copy()
    picture(c,"cd-signature",815,113+35*(1-e),290,alpha=e,shadow=False)
    title(c,"ClutterDock",960,432+25*(1-e),113,INK,True,center=True,alpha=e)
    title(c,"A little less clutter. A little more focus.",960,594,39,MUTED,center=True,alpha=ease((t-.3)/.8))
    p=ease((t-.65)/.75)
    pill(c,"Free for Mac & Windows",960,715,408,p)
    title(c,"clutterdock.com",960,840,35,BLUE,True,center=True,alpha=p)
    return c

def frame(t):
    index=next((i for i in range(7) if t<BOUNDS[i+1]),6)
    local=t-BOUNDS[index]
    c=scene(index,local)
    # Short editorial dissolves preserve a clean reading interval per scene.
    fade=.33
    if index>0 and local<fade:
        old=scene(index-1,BOUNDS[index]-BOUNDS[index-1]+local)
        c=Image.blend(old,c,smooth(local/fade))
    if t>DURATION-.7:c=Image.blend(c,LIGHT,smooth((t-(DURATION-.7))/.7)*.14)
    return c.convert("RGB")

def soundtrack():
    sr=48000; samples=int(sr*DURATION)
    audio=np.zeros((samples,2),np.float32)
    def add(start,values,pan=0):
        n=int(start*sr);length=min(len(values),samples-n)
        if length<=0:return
        audio[n:n+length,0]+=values[:length]*math.sqrt((1-pan)/2)
        audio[n:n+length,1]+=values[:length]*math.sqrt((1+pan)/2)
    def hz(note):return 440*2**((note-69)/12)
    chords=[[52,55,59,66],[48,52,55,62],[43,50,57,59],[50,54,57,64]]
    for bar in range(8):
        notes=chords[bar%4];tt=np.arange(int(sr*5.5))/sr
        env=np.minimum(1,tt/1.0)*np.minimum(1,np.maximum(0,(5.5-tt)/1.7))
        for j,note in enumerate(notes):
            f=hz(note);tone=(np.sin(2*np.pi*f*tt)+.24*np.sin(2*np.pi*(f*2+.3)*tt)+.10*np.sin(2*np.pi*f*3*tt))*.035*env
            add(bar*4,tone,(j-1.5)/2.8)
        for beat in range(8):
            note=notes[[0,2,3,1,2,0,3,2][beat]]+12
            tt=np.arange(int(sr*1.25))/sr
            env=(1-np.exp(-tt*130))*np.exp(-tt*5.5)
            tone=(np.sin(2*np.pi*hz(note)*tt)+.18*np.sin(2*np.pi*hz(note)*2*tt))*.07*env
            add(bar*4+beat*.5,tone,(-.25 if beat%2 else .25))
            add(bar*4+beat*.5+.19,tone*.22,(-.35 if not beat%2 else .35))
    # Soft original transition breaths, not sampled sound effects.
    rng=np.random.default_rng(504)
    for start in BOUNDS[1:-1]:
        noise=rng.normal(0,1,int(sr*.5));noise=np.convolve(noise,np.ones(40)/40,mode="same")
        env=np.sin(np.linspace(0,np.pi,len(noise)))**2
        add(start-.12,noise*env*.055,0)
    seconds=np.arange(samples)/sr
    envelope=np.minimum(1,seconds/1.5)*np.minimum(1,np.maximum(0,(DURATION-seconds)/1.4))
    audio*=envelope[:,None]
    audio*=.55/max(.55,float(np.abs(audio).max()))
    with wave.open(str(OUT/"original-score.wav"),"wb") as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr)
        w.writeframes((audio*32767).astype("<i2").tobytes())

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--stills",action="store_true");args=parser.parse_args()
    for i,t in enumerate([2.6,6.8,10.7,15.8,20.9,25.4,30.1]):
        frame(t).save(OUT/f"scene-{i+1:02}.jpg",quality=94)
    frame(6.8).save(OUT/"poster.jpg",quality=94)
    if args.stills:return
    soundtrack()
    cmd=["ffmpeg","-hide_banner","-loglevel","warning","-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-i",str(OUT/"original-score.wav"),"-c:v","libx264","-preset","fast","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","-t",str(DURATION),str(OUT/"clutterdock-feature-film-1080p.mp4")]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for i in range(FPS*DURATION):
        process.stdin.write(frame(i/FPS).tobytes())
        if i%150==0:print(f"Rendered {i/FPS:.0f}s / {DURATION}s",flush=True)
    process.stdin.close()
    if process.wait():raise RuntimeError("ffmpeg encoding failed")
    print(OUT/"clutterdock-feature-film-1080p.mp4",flush=True)

if __name__=="__main__":main()
