import { runAgent } from "@/lib/claude"
import { scoreGeneratedSite } from "@/lib/agents/site-researcher"

function makeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site"
}

// ── Quality baseline (process-level, resets on redeploy — intentional) ────────
// Starts at 8.0 and ratchets up each time a site scores above it.
// This means every new site must beat the previous best — no ceiling.

let _qualityBaseline = 8.0
let _totalGenerated  = 0

export function getQualityBaseline(): number { return _qualityBaseline }
export function getGenerationCount(): number { return _totalGenerated }

export function raiseQualityBaseline(score: number): void {
  _totalGenerated++
  if (score > _qualityBaseline) {
    _qualityBaseline = Math.min(9.9, _qualityBaseline + 0.15)
  }
}

// ── System prompt (core techniques — always present) ─────────────────────────

function buildSystemPrompt(qualityBaseline: number, generationCount: number): string {
  const mandate = generationCount === 0
    ? "Build the highest-quality website you are capable of. Target: 9+/10."
    : `QUALITY MANDATE: Previous sites averaged ${qualityBaseline.toFixed(1)}/10. You MUST score above ${(qualityBaseline + 0.2).toFixed(1)}/10. Every generation raises the bar — there is NO ceiling.`

  return `You are the world's #1 frontend engineer. You build complete, award-winning single-file HTML websites.

${mandate}

━━━ OUTPUT FORMAT ━━━
Output EXACTLY this — no JSON, no markdown fences, no explanation before or after:

SITE_TITLE: [compelling SEO title]
SITE_SLUG: [url-friendly-slug]
SITE_HTML:
<!DOCTYPE html>
[complete website]
</html>

━━━ CDN LIBRARIES (only these) ━━━
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>
Google Fonts via CSS @import only — never <link> tags

━━━ CSS FOUNDATION ━━━
:root {
  --brand: BRAND_COLOR_PLACEHOLDER;
  --brand-dark: color-mix(in srgb, var(--brand) 62%, black);
  --brand-glow: color-mix(in srgb, var(--brand) 22%, transparent);
  --text: #f1f5f9; --text-muted: #94a3b8;
  --bg: #070710; --bg-alt: #0d0d1a;
  --surface: rgba(255,255,255,0.04); --border: rgba(255,255,255,0.07);
  --radius: 14px; --radius-lg: 28px; --radius-pill: 999px;
  --shadow-brand: 0 0 50px var(--brand-glow);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); overflow-x: hidden; }
section { padding: clamp(5rem, 11vw, 10rem) clamp(1.5rem, 6vw, 7rem); }
h1 { font-size: clamp(3.2rem, 7.5vw, 8rem); line-height: 1.02; }
h2 { font-size: clamp(2.2rem, 4.5vw, 4.5rem); line-height: 1.08; }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; }

━━━ TECHNIQUE 1 — SCROLL TRACKING ━━━
Fixed scroll progress bar + scroll-driven parallax on hero:

<div id="scroll-bar" style="position:fixed;top:0;left:0;height:3px;background:var(--brand);z-index:1000;width:0;transition:width 0.08s linear;pointer-events:none;will-change:width"></div>

let _sy = 0, _sp = 0;
const _th = () => Math.max(document.body.scrollHeight - innerHeight, 1);
window.addEventListener('scroll', () => {
  _sy = window.scrollY;
  _sp = _sy / _th();
  const bar = document.getElementById('scroll-bar');
  if (bar) bar.style.width = (_sp * 100) + '%';
  const heroContent = document.querySelector('.hero-content');
  if (heroContent && _sy < innerHeight) {
    heroContent.style.transform = 'translateY(' + (_sy * 0.22) + 'px)';
    heroContent.style.opacity   = String(Math.max(0, 1 - _sy / (innerHeight * 0.65)));
  }
  document.querySelector('.site-nav')?.classList.toggle('scrolled', _sy > 60);
}, { passive: true });

━━━ TECHNIQUE 2 — VIEWPORT DETECTION ━━━
CSS + IntersectionObserver reveal system:

[data-reveal] { opacity:0; transform:translateY(48px); transition:opacity 0.75s cubic-bezier(.25,.46,.45,.94), transform 0.75s cubic-bezier(.25,.46,.45,.94); }
[data-reveal].in-view { opacity:1; transform:none; }
[data-reveal][data-delay="1"] { transition-delay:.12s; }
[data-reveal][data-delay="2"] { transition-delay:.24s; }
[data-reveal][data-delay="3"] { transition-delay:.36s; }
[data-reveal][data-delay="4"] { transition-delay:.48s; }
[data-reveal][data-delay="5"] { transition-delay:.60s; }

const _io = new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); _io.unobserve(e.target); } });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => _io.observe(el));

━━━ TECHNIQUE 3 — STICKY NAV ━━━
<nav class="site-nav">
  <div class="nav-logo">LOGO</div>
  <ul class="nav-links"><li><a>...</a></li></ul>
  <a class="nav-cta btn-primary">CTA</a>
  <button class="hamburger" onclick="document.querySelector('.mobile-nav').classList.toggle('open');this.classList.toggle('open')">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="mobile-nav">...</div>

.site-nav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between; padding:1.2rem clamp(1.5rem,5vw,5rem); transition:background .4s,backdrop-filter .4s,box-shadow .4s; }
.site-nav.scrolled { background:rgba(7,7,16,.94); backdrop-filter:blur(24px); box-shadow:0 1px 0 var(--border); }
.hamburger { display:none; flex-direction:column; gap:5px; cursor:pointer; background:none; border:none; padding:4px; }
.hamburger span { width:24px; height:2px; background:var(--text); transition:.3s; display:block; }
.hamburger.open span:first-child { transform:rotate(45deg) translate(5px,5px); }
.hamburger.open span:nth-child(2) { opacity:0; width:0; }
.hamburger.open span:last-child { transform:rotate(-45deg) translate(5px,-5px); }
.mobile-nav { position:fixed; inset:0; background:rgba(7,7,16,.98); z-index:90; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2rem; font-size:1.5rem; transform:translateX(100%); transition:transform .45s cubic-bezier(.77,0,.18,1); }
.mobile-nav.open { transform:none; }
@media (max-width:768px) { .nav-links,.nav-cta { display:none; } .hamburger { display:flex; } }

━━━ TECHNIQUE 4 — EASING ━━━
GSAP entrance animations on every section:

gsap.registerPlugin(ScrollTrigger);

// Stagger children on section entry
gsap.utils.toArray('.gsap-section').forEach(section => {
  const items = section.querySelectorAll('.gsap-item');
  if (!items.length) return;
  gsap.fromTo(items,
    { opacity:0, y:55, scale:0.97 },
    { opacity:1, y:0, scale:1, duration:0.85, stagger:0.11, ease:'power3.out',
      scrollTrigger:{ trigger:section, start:'top 78%', once:true } }
  );
});

// Hero intro sequence
gsap.from('.hero-eyebrow', { opacity:0, y:16, duration:0.7, ease:'expo.out', delay:0.15 });
gsap.from('.hero-sub',     { opacity:0, y:24, duration:0.85, ease:'power3.out', delay:0.9 });
gsap.from('.hero-cta',     { opacity:0, y:28, duration:0.85, ease:'back.out(1.7)', delay:1.1, stagger:0.14 });
gsap.from('.hero-badges',  { opacity:0, y:20, duration:0.7, ease:'power2.out', delay:1.4 });

━━━ TECHNIQUE 5 — TEXT SPLITTING ━━━
Animate headlines letter-by-letter with perspective depth:

function splitAndAnimate(selector, opts={}) {
  document.querySelectorAll(selector).forEach(el => {
    const words = el.textContent.split(' ');
    el.style.perspective = '800px';
    el.innerHTML = words.map(w =>
      '<span style="display:inline-block;overflow:hidden;vertical-align:top;margin-right:.22em">' +
      [...w].map(c => '<span class="char" style="display:inline-block;will-change:transform">' + (c||'') + '</span>').join('') +
      '</span>'
    ).join('');
    const chars = el.querySelectorAll('.char');
    gsap.from(chars, {
      opacity:0, y:'105%', rotationX: -85,
      duration: opts.dur||0.65, stagger: opts.stag||0.026,
      ease: opts.ease||'power4.out', delay: opts.delay||0,
      scrollTrigger: opts.scroll ? { trigger:el, start:'top 88%', once:true } : undefined
    });
  });
}
// Hero headline fires immediately:
splitAndAnimate('.hero-headline', { delay:0.3 });
// Section headings fire on scroll:
splitAndAnimate('.section-headline', { scroll:true, dur:0.6, stag:0.022 });

━━━ TECHNIQUE 6 — MAP RANGE ━━━
Map scroll position to visual values:

const mapRange = (v,a,b,c,d) => c + ((Math.min(Math.max(v,a),b)-a)/(b-a))*(d-c);

// Example usage in scroll listener:
// const heroOpacity = mapRange(_sy, 0, innerHeight*0.6, 1, 0);
// const bgScale     = mapRange(_sy, 0, innerHeight, 1, 1.06);
// section parallax: el.style.transform = 'translateY(' + mapRange(_sy, sTop, sBot, 0, -60) + 'px)';

━━━ TECHNIQUE 7 — LERP + CUSTOM CURSOR ━━━
Smooth lazy-follow cursor using linear interpolation:

const lerp = (a,b,t) => a + (b-a)*t;
let _mx=innerWidth/2, _my=innerHeight/2, _cx=_mx, _cy=_my;
const _cur = document.querySelector('.cursor');
const _dot = document.querySelector('.cursor-dot');
document.addEventListener('mousemove', e => { _mx=e.clientX; _my=e.clientY; }, { passive:true });
(function _animCursor() {
  requestAnimationFrame(_animCursor);
  _cx = lerp(_cx, _mx, 0.1);
  _cy = lerp(_cy, _my, 0.1);
  if (_cur) _cur.style.transform = 'translate('+_cx+'px,'+_cy+'px)';
  if (_dot) _dot.style.transform = 'translate('+_mx+'px,'+_my+'px)';
})();
document.querySelectorAll('a,button,[data-hover]').forEach(el => {
  el.addEventListener('mouseenter', () => _cur?.classList.add('hover'));
  el.addEventListener('mouseleave', () => _cur?.classList.remove('hover'));
});

HTML (right after <body> open):
<div class="cursor"></div>
<div class="cursor-dot"></div>

CSS:
.cursor { position:fixed;width:44px;height:44px;border:1.5px solid var(--brand);border-radius:50%;pointer-events:none;z-index:9999;margin:-22px 0 0 -22px;transition:border-color .3s,width .3s,height .3s,margin .3s,opacity .3s;will-change:transform; }
.cursor-dot { position:fixed;width:6px;height:6px;background:var(--brand);border-radius:50%;pointer-events:none;z-index:10000;margin:-3px 0 0 -3px;will-change:transform; }
.cursor.hover { width:68px;height:68px;margin:-34px 0 0 -34px;border-color:rgba(255,255,255,.6);opacity:.7; }
@media (hover:none),(pointer:coarse) { .cursor,.cursor-dot { display:none; } }

━━━ TECHNIQUE 8 — GLSL SHADER ━━━
ShaderMaterial on Three.js plane behind the hero geometry:

const _vShader = \`
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x*2.8+uTime*0.85)*0.16 + cos(p.y*2.1+uTime*0.65)*0.11;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
  }
\`;
const _fShader = \`
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  void main() {
    float d = length(vUv - 0.5);
    float ring = sin(d*20.0 - uTime*2.0)*0.5+0.5;
    float pulse = sin(uTime*0.5)*0.12+0.88;
    float glow = (1.0-smoothstep(0.0,0.52,d))*pulse;
    float noise = sin(vUv.x*38.0+uTime)*sin(vUv.y*38.0+uTime*0.9)*0.04;
    gl_FragColor = vec4(mix(vec3(0.0),uColor,(ring*glow+noise)*0.85), glow*ring*0.65+noise*0.2);
  }
\`;
const _sUniforms = { uTime:{ value:0.0 }, uColor:{ value:new THREE.Color(BRAND_INT_PLACEHOLDER) } };
const _sMat = new THREE.ShaderMaterial({
  vertexShader:_vShader, fragmentShader:_fShader,
  uniforms:_sUniforms, transparent:true, depthWrite:false, side:THREE.DoubleSide
});

━━━ WEBGL FULL HERO ━━━
Shader plane + Icosahedron + particles + lerp mouse rotation:

const _canvas = document.getElementById('hero-canvas');
let _r3d, _raf3d;
try {
  _r3d = new THREE.WebGLRenderer({ canvas:_canvas, antialias:true, alpha:true });
  _r3d.setPixelRatio(Math.min(devicePixelRatio,2));
  _r3d.setSize(innerWidth,innerHeight);
  const _sc = new THREE.Scene();
  const _cam = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 100);
  _cam.position.z = 5;
  _sc.add(new THREE.AmbientLight(0xffffff,0.2));
  const _pl = new THREE.PointLight(BRAND_INT_PLACEHOLDER, 4, 18);
  _sc.add(_pl);
  // Shader background plane
  const _plane = new THREE.Mesh(new THREE.PlaneGeometry(16,11,36,36), _sMat);
  _plane.position.z = -3;
  _sc.add(_plane);
  // Main icosahedron
  const _iGeo = new THREE.IcosahedronGeometry(1.55,1);
  const _iMat = new THREE.MeshPhongMaterial({ color:BRAND_INT_PLACEHOLDER, shininess:130, specular:0xffffff });
  const _iMesh = new THREE.Mesh(_iGeo,_iMat);
  const _wMesh = new THREE.Mesh(_iGeo, new THREE.MeshBasicMaterial({ color:0xffffff, wireframe:true, transparent:true, opacity:0.055 }));
  _sc.add(_iMesh,_wMesh);
  // Particles
  const _pGeo = new THREE.BufferGeometry();
  const _pArr = new Float32Array(2700);
  for(let i=0;i<2700;i++) _pArr[i]=(Math.random()-.5)*12;
  _pGeo.setAttribute('position', new THREE.BufferAttribute(_pArr,3));
  _sc.add(new THREE.Points(_pGeo, new THREE.PointsMaterial({ color:BRAND_INT_PLACEHOLDER, size:0.013, transparent:true, opacity:0.5 })));
  let _wt=0, _wmx=0, _wmy=0, _wtx=0, _wty=0;
  document.addEventListener('mousemove', e=>{ _wmx=(e.clientX/innerWidth-.5)*2; _wmy=-(e.clientY/innerHeight-.5)*2; },{ passive:true });
  (function _loopGL(){
    _raf3d = requestAnimationFrame(_loopGL);
    _wt += 0.007;
    _wtx = lerp(_wtx, _wmx*0.5, 0.04);
    _wty = lerp(_wty, _wmy*0.5, 0.04);
    _iMesh.rotation.y = _wt*0.3+_wtx;
    _iMesh.rotation.x = _wt*0.15+_wty;
    _wMesh.rotation.copy(_iMesh.rotation);
    _pl.position.set(Math.sin(_wt)*4, Math.cos(_wt*.7)*3, 3);
    _sUniforms.uTime.value = _wt;
    _r3d.render(_sc,_cam);
  })();
  window.addEventListener('resize',()=>{ _cam.aspect=innerWidth/innerHeight; _cam.updateProjectionMatrix(); _r3d.setSize(innerWidth,innerHeight); });
} catch(e) {
  if(_canvas) _canvas.style.background='radial-gradient(ellipse at 50% 55%, BRAND_COLOR_PLACEHOLDER 0%, #070710 68%)';
}

Hero HTML:
<section class="hero">
  <canvas id="hero-canvas" style="position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none"></canvas>
  <div class="hero-content" style="position:relative;z-index:1;will-change:transform,opacity">
    <div class="hero-eyebrow">...</div>
    <h1 class="hero-headline">...</h1>
    <p class="hero-sub">...</p>
    <div class="hero-cta-group">
      <a class="btn-primary hero-cta">...</a>
      <a class="btn-ghost hero-cta">...</a>
    </div>
    <div class="hero-badges">...</div>
  </div>
</section>

━━━ BUTTON STYLES ━━━
.btn-primary { display:inline-flex;align-items:center;gap:.5rem;padding:.875rem 2.2rem;background:var(--brand);color:#fff;font-weight:700;font-size:.95rem;letter-spacing:.02em;border-radius:var(--radius-pill);border:none;cursor:pointer;transition:transform .25s,box-shadow .25s,filter .25s;will-change:transform; }
.btn-primary:hover { transform:translateY(-2px) scale(1.02);box-shadow:var(--shadow-brand);filter:brightness(1.1); }
.btn-ghost { display:inline-flex;align-items:center;gap:.5rem;padding:.875rem 2.2rem;background:transparent;color:var(--text);font-weight:600;font-size:.95rem;border:1.5px solid var(--border);border-radius:var(--radius-pill);cursor:pointer;transition:border-color .25s,background .25s; }
.btn-ghost:hover { border-color:var(--brand);background:var(--brand-glow); }

━━━ GLASSMORPHISM CARDS ━━━
.card { background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2.5rem 2rem;backdrop-filter:blur(14px);transition:transform .35s cubic-bezier(.25,.46,.45,.94),box-shadow .35s,border-color .35s;will-change:transform; }
.card:hover { transform:translateY(-10px);box-shadow:0 28px 70px var(--brand-glow),0 0 0 1px var(--brand);border-color:var(--brand); }

━━━ MARQUEE ━━━
.marquee { overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:1.2rem 0; }
.marquee-inner { display:flex;gap:3rem;width:max-content;animation:marquee 30s linear infinite;align-items:center; }
@keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
.marquee:hover .marquee-inner { animation-play-state:paused; }

━━━ NUMBER COUNTER ━━━
function _animCount(el) {
  const t=+el.dataset.target, s=el.dataset.suffix||'', p=el.dataset.prefix||'';
  let c=0; const inc=t/75;
  const id=setInterval(()=>{c=Math.min(c+inc,t);el.textContent=p+Math.floor(c).toLocaleString()+s;if(c>=t)clearInterval(id);},14);
}
new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){_animCount(e.target);}});},{threshold:.55}).observe;
// Fix: use correct API:
const _cio = new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){_animCount(e.target);_cio.unobserve(e.target);}});},{threshold:.55});
document.querySelectorAll('[data-target]').forEach(el=>_cio.observe(el));

━━━ TECHNIQUE 9 — PAGE LOAD SEQUENCE ━━━
Luxury loading screen before content reveals. Add as FIRST child of <body>:

<div id="page-loader" style="position:fixed;inset:0;background:var(--bg);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem">
  <div id="loader-num" style="font-size:clamp(3rem,8vw,6rem);font-weight:800;color:var(--brand);letter-spacing:-.02em;font-variant-numeric:tabular-nums">0</div>
  <div style="width:220px;height:2px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden">
    <div id="loader-bar" style="height:100%;width:0%;background:var(--brand);transition:width .08s linear"></div>
  </div>
  <div style="font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--text-muted)">Loading Experience</div>
</div>

JS (before closing </body>, runs immediately):
(function(){
  document.documentElement.style.overflow='hidden';
  let p=0;
  const num=document.getElementById('loader-num'),bar=document.getElementById('loader-bar'),loader=document.getElementById('page-loader');
  const iv=setInterval(()=>{
    p+=Math.random()*14+5; if(p>100)p=100;
    if(num)num.textContent=Math.floor(p)+'%';
    if(bar)bar.style.width=p+'%';
    if(p>=100){clearInterval(iv);setTimeout(()=>{
      if(typeof gsap!=='undefined'){
        gsap.to(loader,{yPercent:-100,duration:1.1,ease:'power4.inOut',onComplete:()=>{loader.remove();document.documentElement.style.overflow='';}});
      } else { loader.remove(); document.documentElement.style.overflow=''; }
    },350);}
  },55);
})();

━━━ TECHNIQUE 10 — MAGNETIC BUTTONS ━━━
All .btn-primary elements attract the cursor. Add class="magnetic" to CTAs.

document.querySelectorAll('.magnetic').forEach(btn=>{
  btn.addEventListener('mousemove',e=>{
    const r=btn.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;
    btn.style.transition='transform 0.08s ease';
    btn.style.transform='translate('+(x*.3)+'px,'+(y*.3)+'px)';
  });
  btn.addEventListener('mouseleave',()=>{
    btn.style.transition='transform 0.55s cubic-bezier(.25,.46,.45,.94)';
    btn.style.transform='translate(0,0)';
  });
});

━━━ TECHNIQUE 11 — 3D CARD TILT ━━━
Add class="tilt-card" to EVERY .card element.

document.querySelectorAll('.tilt-card').forEach(card=>{
  card.style.transformStyle='preserve-3d';
  card.addEventListener('mousemove',e=>{
    const r=card.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
    card.style.transition='transform 0.08s ease,box-shadow 0.08s';
    card.style.transform='perspective(700px) rotateY('+(x*16)+'deg) rotateX('+(-y*16)+'deg) scale(1.04)';
    card.style.boxShadow='0 30px 70px var(--brand-glow),0 0 0 1px var(--brand)';
    card.style.borderColor='var(--brand)';
  });
  card.addEventListener('mouseleave',()=>{
    card.style.transition='transform 0.6s cubic-bezier(.25,.46,.45,.94),box-shadow 0.4s,border-color 0.4s';
    card.style.transform='perspective(700px) rotateY(0) rotateX(0) scale(1)';
    card.style.boxShadow='';
    card.style.borderColor='';
  });
});

━━━ TECHNIQUE 12 — HORIZONTAL SCROLL SECTION ━━━
Pin a section and scroll horizontally (use for services or portfolio):

HTML:
<section class="h-section gsap-section">
  <div style="padding:3rem clamp(1.5rem,5vw,5rem)"><h2 class="section-headline split-text">Our Services</h2></div>
  <div class="h-track" style="display:flex;gap:2rem;padding:0 clamp(1.5rem,5vw,5rem) 4rem;width:max-content">
    <div class="h-card tilt-card card">...</div>
    <div class="h-card tilt-card card">...</div>
    <div class="h-card tilt-card card">...</div>
    <div class="h-card tilt-card card">...</div>
  </div>
</section>

CSS:
.h-section { overflow:hidden; padding:0; }
.h-card { width:360px; flex-shrink:0; }

JS:
const htrack=document.querySelector('.h-track');
if(htrack){
  gsap.to(htrack,{
    x:()=>-(htrack.scrollWidth-innerWidth+120), ease:'none',
    scrollTrigger:{ trigger:'.h-section', start:'top top', end:()=>'+='+(htrack.scrollWidth-innerWidth+120), scrub:1.2, pin:true, anticipatePin:1 }
  });
}

━━━ TECHNIQUE 13 — CLIP-PATH WIPE REVEALS ━━━
Cinematic left-to-right sweeps. Add .wipe-reveal to section headings and key visuals.

CSS:
.wipe-reveal { clip-path:inset(0 100% 0 0); transition:clip-path 1s cubic-bezier(.77,0,.18,1); }
.wipe-reveal.in-view { clip-path:inset(0 0% 0 0); }
.section-headline { position:relative; display:inline-block; }
.section-headline::after { content:''; position:absolute; bottom:-8px; left:0; width:0; height:3px; background:var(--brand); border-radius:2px; transition:width 1.1s cubic-bezier(.77,0,.18,1) 0.3s; }
.section-headline.in-view::after { width:55%; }

Add .wipe-reveal class alongside [data-reveal] — the IntersectionObserver adds .in-view to both.

━━━ TECHNIQUE 14 — MICRO-ANIMATIONS ━━━
Polish every interactive element for a premium feel:

Nav link underlines:
.nav-links a { position:relative; padding-bottom:3px; }
.nav-links a::after { content:''; position:absolute; bottom:0; left:0; width:0; height:1.5px; background:var(--brand); transition:width .3s ease; }
.nav-links a:hover::after { width:100%; }

Section label chips above every h2:
<div class="chip">Our Services</div><h2 class="section-headline wipe-reveal">Headline</h2>
.chip { display:inline-block; padding:.3rem 1rem; border:1px solid var(--brand); border-radius:var(--radius-pill); font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:var(--brand); margin-bottom:.9rem; background:var(--brand-glow); }

Button arrow slide:
<a class="btn-primary magnetic btn-arrow">Get Started <span class="arr">→</span></a>
.btn-arrow .arr { display:inline-block; transition:transform .3s ease; }
.btn-arrow:hover .arr { transform:translateX(5px); }

Footer link hover shift:
.footer-links a { display:inline-block; transition:color .2s, transform .2s; }
.footer-links a:hover { color:var(--brand); transform:translateX(5px); }

━━━ ALL 9 SECTIONS (REQUIRED) ━━━
1. NAV — sticky + .scrolled, logo, nav-links (micro underlines), magnetic CTA, hamburger
2. HERO — page-loader first, WebGL+shader canvas, scroll-bar, lerp cursor, text-split headline, magnetic CTAs, trust badges
3. SOCIAL PROOF BAR — marquee: "4.9★ Rating" / "500+ Projects" / "$50M Generated" (duplicate content for seamless loop)
4. SERVICES — use HORIZONTAL SCROLL h-section with 4 tilt-card cards
5. ABOUT/STATS — two cols: 3 count-up stats (data-target/data-suffix) | wipe-reveal story paragraph + CTA
6. PROCESS — chip label + wipe-reveal h2, 3-4 numbered steps with brand circles
7. TESTIMONIALS — 3 tilt-card cards, ★★★★★, blockquote, name, company, data-reveal stagger
8. CTA SECTION — full-width brand bg, split-text + wipe-reveal headline, single magnetic btn-primary
9. FOOTER — dark bg, logo+tagline, 3-4 link columns (footer-links), social icons, copyright bar

━━━ CONTENT STANDARDS ━━━
- Write REAL compelling marketing copy for this specific business — no generic filler
- Stats: specific and believable ("1,400+ Roofs Installed" not "Many projects")
- Testimonials: sound like real customers from the business's actual location/industry
- Tagline: memorable and specific, not generic
- CTAs: action-driven ("Get Your Free Estimate", "Talk to an Expert", "See Our Work")`
}

// ── Output extractor ──────────────────────────────────────────────────────────

function extractResult(raw: unknown): { html: string; title: string; slug: string } {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw)

  const titleMatch = text.match(/SITE_TITLE:\s*(.+)/i)
  const slugMatch  = text.match(/SITE_SLUG:\s*([a-z0-9-]+)/i)

  // Primary: SITE_HTML: marker
  const htmlMatch = text.match(/SITE_HTML:\s*\r?\n?(<!DOCTYPE[\s\S]+)/i)
  if (htmlMatch?.[1]) {
    return {
      html:  htmlMatch[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  // Fallback: bare DOCTYPE block
  const bareHtml = text.match(/(<!DOCTYPE[\s\S]+<\/html>)/i)
  if (bareHtml?.[1]) {
    return {
      html:  bareHtml[1].trim(),
      title: titleMatch?.[1]?.trim() ?? "Business Website",
      slug:  slugMatch?.[1]?.trim()  ?? "website",
    }
  }

  // Legacy: JSON {html, title, slug}
  if (raw && typeof raw === "object" && "html" in (raw as object)) {
    const r = raw as Record<string, string>
    return { html: r.html, title: r.title ?? "Website", slug: r.slug ?? "site" }
  }

  throw new Error("Website generation produced no HTML. The model may have hit its output limit — try again.")
}

// ── Post-processing: replace any leftover placeholders ───────────────────────

function postProcess(html: string, brandColor: string, brandInt: string): string {
  return html
    .replace(/BRAND_COLOR_PLACEHOLDER/g, brandColor)
    .replace(/BRAND_INT_PLACEHOLDER/g,   brandInt)
    .replace(/BRAND_COLOR/g, brandColor)
    .replace(/BRAND_INT/g,   brandInt)
}

// ── Improvement pass ──────────────────────────────────────────────────────────

async function improveWebsite(
  html: string,
  score: number,
  business: { name: string; type: string },
  brandColor: string,
  brandInt: string,
  maxTokens: number
): Promise<string> {
  const checks = [
    !html.includes("ShaderMaterial")                                          && "Add ShaderMaterial GLSL shader to the Three.js hero plane",
    !(html.includes("splitAndAnimate") || html.includes(".char"))             && "Add splitAndAnimate() letter-by-letter animation to hero headline and section headings",
    !html.includes("lerp(")                                                   && "Add lerp() for smooth custom cursor",
    !html.includes("mapRange(")                                               && "Add mapRange() driving hero opacity/scale from scroll position",
    !html.includes("IntersectionObserver")                                    && "Add IntersectionObserver with [data-reveal] on all section headings and cards",
    !html.includes("ScrollTrigger")                                           && "Add GSAP ScrollTrigger stagger animations on every section",
    !(html.includes("WebGLRenderer") || html.includes("IcosahedronGeometry")) && "Add Three.js WebGL hero canvas with icosahedron geometry",
    !(html.includes("page-loader") || html.includes("loader-bar"))           && "Add luxury page load sequence with animated percentage counter",
    !html.includes("magnetic")                                                && "Add magnetic button effect to all CTA buttons",
    !(html.includes("tilt-card") || html.includes("rotateY("))               && "Add 3D card tilt effect to service and testimonial cards",
    !(html.includes("h-track") || html.includes("h-scroll"))                 && "Add GSAP horizontal scroll section for services showcase",
    !(html.includes("wipe-reveal") || html.includes("clip-path"))            && "Add clip-path wipe reveal animations to section headings",
    !html.includes("chip")                                                    && "Add label chip elements above every section heading",
    !html.includes("marquee")                                                 && "Add CSS marquee social proof bar",
    !html.includes("hamburger")                                               && "Add hamburger mobile menu with animated drawer",
    html.length < 45000                                                       && "Website HTML is too short — expand all sections with substantially more content",
  ].filter(Boolean) as string[]

  if (checks.length === 0) return html

  const improved = await runAgent(
    buildSystemPrompt(_qualityBaseline, _totalGenerated),
    `You previously generated a website for ${business.name} (${business.type}) that scored ${score.toFixed(1)}/10.

The current quality baseline is ${_qualityBaseline.toFixed(1)}/10 — you MUST beat it.

SPECIFIC ISSUES TO FIX:
${checks.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Here is the current HTML to improve:
${html.slice(0, 8000)}
[...truncated for brevity — rewrite the complete document with all fixes applied]

Output the complete improved website:
SITE_TITLE: ${business.name} — [Subtitle]
SITE_SLUG: [slug]
SITE_HTML:
<!DOCTYPE html>
...complete improved document...
</html>`,
    { jsonMode: false, maxTokens, model: "sonnet" }
  )

  const result = extractResult(improved)
  return postProcess(result.html, brandColor, brandInt)
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface GenerateWebsiteParams {
  business: {
    name:        string
    type:        string
    description: string
    location:    string
    phone?:      string | null
    website?:    string | null
  }
  brandVoice:       Record<string, unknown>
  brandColor:       string
  services:         string[]
  tagline?:         string
  reviews?:         Array<{ reviewerName: string; rating: number; reviewText: string }>
  researchContext?: string
}

export interface GenerateWebsiteResult {
  html:         string
  title:        string
  slug:         string
  qualityScore: number
  iterations:   number
  researchUsed: boolean
}

export async function generateWebsite(params: GenerateWebsiteParams): Promise<GenerateWebsiteResult> {
  const { business, brandColor, services, tagline, reviews = [], researchContext } = params

  const brandInt = `0x${brandColor.replace("#", "")}`

  const reviewText = reviews.length > 0
    ? reviews.slice(0, 4).map(r => `• ${r.reviewerName}: "${r.reviewText}" (${r.rating}/5)`).join("\n")
    : "(Generate 3 realistic testimonials from real-sounding clients in the business's city)"

  const serviceList = services.length > 0
    ? services.slice(0, 6).join(" | ")
    : `Core ${business.type} services`

  const researchSection = researchContext
    ? `\n━━━ RESEARCH & REAL BUSINESS DATA ━━━\nUse this real information to make the site specific and authentic — prefer this over generic content:\n\n${researchContext}\n`
    : ""

  const userPrompt = `Build a complete, award-winning website for this business using ALL 8 advanced techniques from the system prompt.

BUSINESS DETAILS:
Name: ${business.name}
Type: ${business.type}
Location: ${business.location || "Nationwide"}
Phone: ${business.phone || "(use realistic placeholder for this city)"}
Tagline: ${tagline || "(generate a powerful specific tagline for this exact business type)"}
Brand Color: ${brandColor} → Three.js int: ${brandInt}
Services: ${serviceList}
${business.description ? `About: ${business.description}` : ""}
${researchSection}
TESTIMONIALS:
${reviewText}

━━━ REQUIRED SUBSTITUTIONS ━━━
Replace in ALL code:
  BRAND_COLOR_PLACEHOLDER → ${brandColor}
  BRAND_INT_PLACEHOLDER   → ${brandInt}
  DISPLAY_FONT            → best Google Font display family for a "${business.type}"
  BODY_FONT               → matching body font

━━━ QUALITY REQUIREMENT ━━━
Current quality baseline: ${_qualityBaseline.toFixed(1)}/10
You MUST score above ${(_qualityBaseline + 0.2).toFixed(1)}/10 across:
- All 8 techniques present and working
- Real, specific, compelling copy (NOT generic filler)
- Complete 9-section layout, nothing missing
- Advanced visual design with glassmorphism, brand color accents, depth

OUTPUT FORMAT (exactly):
SITE_TITLE: ${business.name} — [Compelling Subtitle]
SITE_SLUG: ${makeSlug(business.name)}
SITE_HTML:
<!DOCTYPE html>
...complete website...
</html>`

  const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY)
  const maxTokens    = hasAnthropic ? 12000 : 4000

  // Pass 1: generate
  const raw     = await runAgent(buildSystemPrompt(_qualityBaseline, _totalGenerated), userPrompt, {
    jsonMode: false, maxTokens, model: "sonnet",
  })
  const pass1   = extractResult(raw)
  let   html    = postProcess(pass1.html, brandColor, brandInt)
  let   iterations = 1

  // Pass 2: score and optionally improve
  let qualityScore = await scoreGeneratedSite(html, business.name, business.type)

  if (qualityScore < _qualityBaseline && hasAnthropic) {
    const improved = await improveWebsite(html, qualityScore, business, brandColor, brandInt, Math.min(maxTokens, 10000))
    if (improved.length > html.length * 0.6) {
      html = improved
      qualityScore = await scoreGeneratedSite(html, business.name, business.type)
      iterations = 2
    }
  }

  // Ratchet up the baseline if this site beat it
  raiseQualityBaseline(qualityScore)

  return {
    html,
    title:        pass1.title,
    slug:         pass1.slug,
    qualityScore,
    iterations,
    researchUsed: !!(researchContext),
  }
}
