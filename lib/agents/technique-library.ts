// Technique library — concise implementation patterns for the AI generator.
// Each entry is ~40-80 tokens (vs 300-500 in the old inline prompt).
// Total: ~1,600 tokens for all 20 techniques (was 8,000+).

export const T = {

  SCROLL_BAR: `
Scroll progress + hero parallax + nav scroll state:
<div id="scroll-bar" style="position:fixed;top:0;left:0;height:3px;background:var(--brand);z-index:1000;width:0;transition:width .08s linear;pointer-events:none"></div>
let _sy=0; window.addEventListener('scroll',()=>{ _sy=window.scrollY; const sp=_sy/Math.max(document.body.scrollHeight-innerHeight,1); document.getElementById('scroll-bar').style.width=(sp*100)+'%'; const hc=document.querySelector('.hero-content'); if(hc&&_sy<innerHeight){hc.style.transform='translateY('+(_sy*.22)+'px)';hc.style.opacity=String(Math.max(0,1-_sy/(innerHeight*.65)));} document.querySelector('.site-nav')?.classList.toggle('scrolled',_sy>60); },{passive:true});`,

  REVEAL: `
IntersectionObserver reveal system:
CSS: [data-reveal]{opacity:0;transform:translateY(48px);transition:opacity .75s cubic-bezier(.25,.46,.45,.94),transform .75s cubic-bezier(.25,.46,.45,.94)} [data-reveal].in-view{opacity:1;transform:none} [data-reveal][data-delay="1"]{transition-delay:.12s}[data-reveal][data-delay="2"]{transition-delay:.24s}[data-reveal][data-delay="3"]{transition-delay:.36s}[data-reveal][data-delay="4"]{transition-delay:.48s}
JS: const _io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');_io.unobserve(e.target);}});},{threshold:.1,rootMargin:'0px 0px -40px 0px'}); document.querySelectorAll('[data-reveal]').forEach(el=>_io.observe(el));`,

  NAV: `
Sticky nav with hamburger mobile menu:
HTML: <nav class="site-nav"><div class="nav-logo" style="font-family:var(--font-display);font-weight:700;font-size:1.2rem">LOGO</div><ul class="nav-links"><li><a href="#services">Services</a></li><li><a href="#about">About</a></li><li><a href="#contact">Contact</a></li></ul><a href="#contact" class="btn-primary magnetic nav-cta" style="padding:.65rem 1.6rem;font-size:.85rem">Get Started</a><button class="hamburger" aria-label="Menu" onclick="document.querySelector('.mobile-nav').classList.toggle('open');this.classList.toggle('open')"><span></span><span></span><span></span></button></nav><div class="mobile-nav" role="dialog"><a href="#services" onclick="this.closest('.mobile-nav').classList.remove('open')">Services</a><a href="#about" onclick="this.closest('.mobile-nav').classList.remove('open')">About</a><a href="#contact" onclick="this.closest('.mobile-nav').classList.remove('open')">Contact</a><a href="#contact" class="btn-primary">Get Started</a></div>
CSS: .site-nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1.2rem clamp(1.5rem,5vw,5rem);transition:background .4s,backdrop-filter .4s,box-shadow .4s} .site-nav.scrolled{background:rgba(7,7,16,.94);backdrop-filter:blur(24px);box-shadow:0 1px 0 var(--border)} .nav-links{display:flex;gap:2rem;list-style:none} .nav-links a{font-size:.9rem;opacity:.75;transition:opacity .2s;position:relative;padding-bottom:3px} .nav-links a::after{content:'';position:absolute;bottom:0;left:0;width:0;height:1.5px;background:var(--brand);transition:width .3s} .nav-links a:hover{opacity:1} .nav-links a:hover::after{width:100%} .hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:4px} .hamburger span{width:24px;height:2px;background:var(--text);transition:.3s;display:block} .hamburger.open span:first-child{transform:rotate(45deg) translate(5px,5px)} .hamburger.open span:nth-child(2){opacity:0;width:0} .hamburger.open span:last-child{transform:rotate(-45deg) translate(5px,-5px)} .mobile-nav{position:fixed;inset:0;background:rgba(7,7,16,.98);z-index:90;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;font-size:1.5rem;font-family:var(--font-display);transform:translateX(100%);transition:transform .45s cubic-bezier(.77,0,.18,1)} .mobile-nav.open{transform:none} @media(max-width:768px){.nav-links{display:none}.hamburger{display:flex}}`,

  GSAP: `
GSAP + ScrollTrigger entrances:
gsap.registerPlugin(ScrollTrigger);
gsap.utils.toArray('.gsap-section').forEach(sec=>{const items=sec.querySelectorAll('.gsap-item');if(!items.length)return;gsap.fromTo(items,{opacity:0,y:55,scale:.97},{opacity:1,y:0,scale:1,duration:.85,stagger:.11,ease:'power3.out',scrollTrigger:{trigger:sec,start:'top 78%',once:true}});});
Hero sequence: gsap.from('.hero-eyebrow',{opacity:0,y:16,duration:.7,ease:'expo.out',delay:.15}); gsap.from('.hero-sub',{opacity:0,y:24,duration:.85,ease:'power3.out',delay:.9}); gsap.from('.hero-cta-row',{opacity:0,y:28,duration:.85,ease:'back.out(1.7)',delay:1.1}); gsap.from('.hero-badges',{opacity:0,y:20,duration:.7,ease:'power2.out',delay:1.4});`,

  KINETIC_TYPE: `
Word-level clip-path reveal (Awwwards standard — used by Igloo SOTY 2024, Cartier, Active Theory):
function revealWords(sel,opts={}){document.querySelectorAll(sel).forEach(el=>{const nodes=[...el.childNodes];el.innerHTML='';nodes.forEach(n=>{if(n.nodeType===3){n.textContent.split(/(\s+)/).forEach(part=>{if(!part.trim()){el.appendChild(document.createTextNode(part));return;}const w=document.createElement('span');w.style.cssText='display:inline-block;overflow:hidden;vertical-align:bottom;margin-right:.12em';const i=document.createElement('span');i.className='word-inner';i.style.cssText='display:inline-block;will-change:transform';i.textContent=part;w.appendChild(i);el.appendChild(w);});}else{const w=document.createElement('span');w.style.cssText='display:inline-block;overflow:hidden;vertical-align:bottom;margin-right:.12em';const i=document.createElement('span');i.className='word-inner';i.style.cssText='display:inline-block;will-change:transform';i.appendChild(n.cloneNode(true));w.appendChild(i);el.appendChild(w);}});gsap.from(el.querySelectorAll('.word-inner'),{y:'115%',opacity:0,duration:opts.dur||1.1,stagger:opts.stag||.07,ease:opts.ease||'power4.out',delay:opts.delay||0,scrollTrigger:opts.scroll?{trigger:el,start:'top 85%',once:true}:undefined});});}
revealWords('.hero-headline',{delay:.25,dur:1.3,stag:.09});
revealWords('.section-headline',{scroll:true,dur:1.1,stag:.07});
Blur reveal: gsap.utils.toArray('.reveal-blur').forEach(el=>{gsap.from(el,{opacity:0,filter:'blur(12px)',y:20,duration:1.2,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 88%',once:true}});});`,

  MAP_RANGE: `const mapRange=(v,a,b,c,d)=>c+((Math.min(Math.max(v,a),b)-a)/(b-a))*(d-c);`,

  CURSOR: `
Lerp cursor + context-aware label (VIEW/DRAG/PLAY — luxury brand signal):
HTML (first in body): <div class="cursor"><span class="cursor-label"></span></div><div class="cursor-dot"></div>
CSS: .cursor{position:fixed;width:44px;height:44px;border:1.5px solid var(--brand);border-radius:50%;pointer-events:none;z-index:9999;margin:-22px 0 0 -22px;transition:border-color .3s,width .35s,height .35s,margin .35s,background .3s;will-change:transform;display:flex;align-items:center;justify-content:center} .cursor-dot{position:fixed;width:6px;height:6px;background:var(--brand);border-radius:50%;pointer-events:none;z-index:10000;margin:-3px 0 0 -3px;will-change:transform} .cursor.hover{width:68px;height:68px;margin:-34px 0 0 -34px;border-color:rgba(255,255,255,.5);opacity:.7} .cursor.has-label{width:80px;height:80px;margin:-40px 0 0 -40px;background:var(--brand);border-color:transparent} .cursor-label{font-size:.45rem;letter-spacing:.18em;text-transform:uppercase;font-weight:700;color:#fff;opacity:0;transition:opacity .2s} .cursor.has-label .cursor-label{opacity:1} @media(hover:none),(pointer:coarse){.cursor,.cursor-dot{display:none}}
JS: const lerp=(a,b,t)=>a+(b-a)*t; let _mx=innerWidth/2,_my=innerHeight/2,_cx=_mx,_cy=_my,_cur=document.querySelector('.cursor'),_dot=document.querySelector('.cursor-dot'),_lbl=document.querySelector('.cursor-label'); document.addEventListener('mousemove',e=>{_mx=e.clientX;_my=e.clientY;},{passive:true}); (function _ac(){requestAnimationFrame(_ac);_cx=lerp(_cx,_mx,.1);_cy=lerp(_cy,_my,.1);if(_cur)_cur.style.transform='translate('+_cx+'px,'+_cy+'px)';if(_dot)_dot.style.transform='translate('+_mx+'px,'+_my+'px)';}())
document.querySelectorAll('[data-cursor-text]').forEach(el=>{el.addEventListener('mouseenter',()=>{if(_lbl)_lbl.textContent=el.dataset.cursorText||'';_cur?.classList.add('has-label','hover');});el.addEventListener('mouseleave',()=>{if(_lbl)_lbl.textContent='';_cur?.classList.remove('has-label','hover');});});
document.querySelectorAll('a,button').forEach(el=>{el.addEventListener('mouseenter',()=>_cur?.classList.add('hover'));el.addEventListener('mouseleave',()=>_cur?.classList.remove('hover'));});`,

  SHADER: `
Three.js WebGL hero (choose geometry variant by business type):
const _vShader=\`varying vec2 vUv;uniform float uTime;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*2.8+uTime*.85)*.16+cos(p.y*2.1+uTime*.65)*.11;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}\`;
const _fShader=\`varying vec2 vUv;uniform float uTime;uniform vec3 uColor;void main(){float d=length(vUv-.5);float ring=sin(d*20.-uTime*2.)*.5+.5;float pulse=sin(uTime*.5)*.12+.88;float glow=(1.-smoothstep(0.,.52,d))*pulse;float n=sin(vUv.x*38.+uTime)*sin(vUv.y*38.+uTime*.9)*.04;gl_FragColor=vec4(mix(vec3(0.),uColor,(ring*glow+n)*.85),glow*ring*.65+n*.2);}\`;
const _su={uTime:{value:0},uColor:{value:new THREE.Color(BRAND_INT)}};
const _mat=new THREE.ShaderMaterial({vertexShader:_vShader,fragmentShader:_fShader,uniforms:_su,transparent:true,depthWrite:false,side:THREE.DoubleSide});
Setup: WebGLRenderer antialias+alpha, PerspectiveCamera z=5, AmbientLight 0.2, PointLight brand-color intensity 4.
Plane 16×11 segments 36×36 at z=-3 with shader. GEOMETRY VARIANTS:
  IcosahedronGeometry(1.55,1) + wireframe clone opacity:.055 — for any business
  TorusKnotGeometry(.8,.28,120,16) — tech/saas/creative
  SphereGeometry(1.4,64,64) wireframe only opacity:.12 — luxury/wellness
Particles: 2700 Float32Array random *.5-12, PointsMaterial size:.013 opacity:.5.
Lerp mouse rotation on geometry. Animate _su.uTime+=.007 each frame.
Resize: camera.aspect+updateProjectionMatrix+renderer.setSize.
Catch WebGL error: canvas.style.background='radial-gradient(ellipse at 50% 55%,BRAND_COLOR 0%,#070710 68%)';`,

  LOADER: `
Page loader — pure CSS exit, no GSAP dependency, 5s hard fallback:
HTML (FIRST child of body): <div id="page-loader" style="position:fixed;inset:0;background:var(--bg);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;transition:transform 1.1s cubic-bezier(.77,0,.18,1),opacity .4s"><div id="loader-num" style="font-family:var(--font-display);font-size:clamp(3rem,8vw,6rem);font-weight:700;color:var(--brand);letter-spacing:-.03em">0%</div><div style="width:220px;height:2px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden"><div id="loader-bar" style="height:100%;width:0%;background:var(--brand);transition:width .08s linear"></div></div><div style="font-size:.6rem;letter-spacing:.25em;text-transform:uppercase;color:var(--text-muted);font-family:var(--font-body)">Loading</div></div>
JS (last in body): (function(){var l=document.getElementById('page-loader');if(!l)return;document.documentElement.style.overflow='hidden';var n=document.getElementById('loader-num'),b=document.getElementById('loader-bar'),p=0;function exit(){l.style.transform='translateY(-100%)';setTimeout(function(){l&&l.parentNode&&l.parentNode.removeChild(l);document.documentElement.style.overflow='';},1200);}var iv=setInterval(function(){p+=Math.random()*14+5;if(p>100)p=100;if(n)n.textContent=Math.floor(p)+'%';if(b)b.style.width=p+'%';if(p>=100){clearInterval(iv);setTimeout(exit,200);}},55);setTimeout(function(){clearInterval(iv);exit();},5000);})();`,

  MAGNETIC: `
Magnetic button pull:
document.querySelectorAll('.magnetic').forEach(btn=>{btn.addEventListener('mousemove',e=>{const r=btn.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;btn.style.transition='transform .08s ease';btn.style.transform='translate('+(x*.3)+'px,'+(y*.3)+'px)';});btn.addEventListener('mouseleave',()=>{btn.style.transition='transform .55s cubic-bezier(.25,.46,.45,.94)';btn.style.transform='translate(0,0)';});});`,

  TILT: `
3D card tilt on hover:
document.querySelectorAll('.tilt-card').forEach(card=>{card.style.transformStyle='preserve-3d';card.addEventListener('mousemove',e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transition='transform .08s ease,box-shadow .08s';card.style.transform='perspective(700px) rotateY('+(x*16)+'deg) rotateX('+(-y*16)+'deg) scale(1.04)';card.style.boxShadow='0 30px 70px var(--brand-glow),0 0 0 1px var(--brand)';card.style.borderColor='var(--brand)';});card.addEventListener('mouseleave',()=>{card.style.transition='transform .6s cubic-bezier(.25,.46,.45,.94),box-shadow .4s,border-color .4s';card.style.transform='perspective(700px) rotateY(0) rotateX(0) scale(1)';card.style.boxShadow='';card.style.borderColor='';});});`,

  H_SCROLL: `
GSAP pinned horizontal scroll for services (scrub:1.2 — scroll-position driven):
HTML: <section class="h-section" style="overflow:hidden;padding:0"><div style="padding:3rem clamp(1.5rem,5vw,5rem)"><div class="overline">What We Do</div><h2 class="section-headline">Services That Deliver</h2></div><div class="h-track" style="display:flex;gap:2rem;padding:0 clamp(1.5rem,5vw,5rem) 4rem;width:max-content">[4–5 .tilt-card.card divs each 360px wide]</div></section>
JS: const ht=document.querySelector('.h-track');if(ht){gsap.to(ht,{x:()=>-(ht.scrollWidth-innerWidth+120),ease:'none',scrollTrigger:{trigger:'.h-section',start:'top top',end:()=>'+='+(ht.scrollWidth-innerWidth+120),scrub:1.2,pin:true,anticipatePin:1}});}`,

  WIPE: `
Clip-path wipe reveals + underline animation:
CSS: .wipe-reveal{clip-path:inset(0 100% 0 0);transition:clip-path 1s cubic-bezier(.77,0,.18,1)} .wipe-reveal.in-view{clip-path:inset(0 0% 0 0)} .section-headline{position:relative;display:inline-block} .section-headline::after{content:'';position:absolute;bottom:-8px;left:0;width:0;height:3px;background:var(--brand);border-radius:2px;transition:width 1.1s cubic-bezier(.77,0,.18,1) .3s} .section-headline.in-view::after{width:55%}
Usage: add .wipe-reveal alongside [data-reveal] on section headings — IntersectionObserver fires both.`,

  MICRO: `
Premium micro-interactions:
CSS: .chip{display:inline-block;padding:.3rem 1rem;border:1px solid var(--brand);border-radius:var(--radius-pill);font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--brand);margin-bottom:1.2rem;background:var(--brand-subtle)} .btn-arrow .arr{display:inline-block;transition:transform .3s ease} .btn-arrow:hover .arr{transform:translateX(5px)} .footer-links a{display:inline-block;transition:color .2s,transform .2s} .footer-links a:hover{color:var(--brand);transform:translateX(5px)}
Number counters: function _animCount(el){const t=+el.dataset.target,s=el.dataset.suffix||'',p=el.dataset.prefix||'';let c=0;const id=setInterval(()=>{c=Math.min(c+t/75,t);el.textContent=p+Math.floor(c).toLocaleString()+s;if(c>=t)clearInterval(id);},14);} const _cio=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){_animCount(e.target);_cio.unobserve(e.target);}});},{threshold:.55}); document.querySelectorAll('[data-target]').forEach(el=>_cio.observe(el));`,

  SCRUB: `
Scroll-scrub animations — scroll speed controls animation pace (Awwwards standard):
gsap.to('.hero-content',{y:-80,opacity:0,scale:.96,ease:'none',scrollTrigger:{trigger:'.hero',start:'center center',end:'bottom top',scrub:1.5}});
gsap.utils.toArray('.section-headline').forEach(el=>{gsap.fromTo(el,{y:50,opacity:0},{y:0,opacity:1,ease:'none',scrollTrigger:{trigger:el,start:'top 90%',end:'top 40%',scrub:1}});});
gsap.utils.toArray('.gsap-section').forEach(sec=>{const cards=sec.querySelectorAll('.card,.gsap-item');if(!cards.length)return;gsap.fromTo(cards,{y:60,opacity:0},{y:0,opacity:1,stagger:.08,ease:'none',scrollTrigger:{trigger:sec,start:'top 85%',end:'top 30%',scrub:1}});});
gsap.utils.toArray('[data-parallax]').forEach(el=>{const speed=parseFloat(el.getAttribute('data-parallax')||'.3');const par=el.closest('section')||el.parentElement;gsap.to(el,{y:()=>-(par?.offsetHeight||400)*speed,ease:'none',scrollTrigger:{trigger:par,start:'top bottom',end:'bottom top',scrub:true}});});`,

  GRAIN: `
CSS SVG film grain overlay — universal on premium sites (Igloo, Linear, Vercel):
CSS (global): body::after{content:'';position:fixed;inset:0;z-index:9997;pointer-events:none;opacity:.22;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");}`,

  CURSOR_TEXT: `Already included in CURSOR technique above — data-cursor-text="VIEW" on image sections, data-cursor-text="DRAG" on horizontal scroll, data-cursor-text="PLAY" on video. The cursor shows the label inside the expanded circle.`,

  SVG_TIMELINE: `
Animated SVG vertical timeline for process sections:
HTML: <section class="process-section gsap-section"><div class="overline">How It Works</div><h2 class="section-headline wipe-reveal">Our Process</h2><div class="timeline"><svg class="timeline-svg" aria-hidden="true"><line class="tl-line" x1="50%" y1="0" x2="50%" y2="100%"/></svg><div class="tl-step gsap-item" data-reveal data-delay="1"><div class="tl-num">01</div><div class="tl-body"><h3>Discovery</h3><p>...</p></div></div>[more steps]</div></section>
CSS: .timeline{position:relative;padding:4rem 0} .timeline-svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none} .tl-line{stroke:var(--brand);stroke-width:1.5;stroke-dasharray:1000;stroke-dashoffset:1000;transition:stroke-dashoffset 2s ease} .tl-line.drawn{stroke-dashoffset:0} .tl-step{display:grid;grid-template-columns:80px 1fr;gap:2rem;margin-bottom:4rem;align-items:start} .tl-num{font-family:var(--font-display);font-size:3.5rem;font-weight:700;color:var(--brand);opacity:.25;line-height:1;letter-spacing:-.04em}
JS: const tl=document.querySelector('.tl-line'); if(tl){new IntersectionObserver(es=>{if(es[0].isIntersecting)tl.classList.add('drawn');},{threshold:.1}).observe(tl);}`,

  PRICING: `
3-tier pricing with monthly/annual toggle:
HTML: <section class="pricing-section gsap-section"><div class="overline">Transparent Pricing</div><h2 class="section-headline wipe-reveal">Simple, Clear Pricing</h2><div class="billing-toggle"><button class="toggle-btn active" data-period="monthly">Monthly</button><button class="toggle-btn" data-period="annual">Annual <span class="discount-chip">Save 20%</span></button></div><div class="pricing-grid">[3 .pricing-card divs with class .popular on center]</div></section>
Each card: <div class="pricing-card tilt-card gsap-item [popular]"><div class="plan-name">Starter</div><div class="plan-price"><span class="price-num" data-monthly="$99" data-annual="$79">$99</span><span>/mo</span></div><ul class="plan-features">[li items with ✓]</ul><a class="btn-primary magnetic btn-arrow">Get Started <span class="arr">→</span></a></div>
CSS: .pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;margin-top:3rem} .pricing-card{padding:2.5rem 2rem;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)} .pricing-card.popular{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 5%,var(--surface));position:relative} .pricing-card.popular::before{content:'Most Popular';position:absolute;top:-1px;left:50%;transform:translateX(-50%);background:var(--brand);color:#fff;font-size:.6rem;letter-spacing:.15em;text-transform:uppercase;padding:.3rem 1rem;border-radius:0 0 8px 8px} .plan-name{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.75rem} .plan-price{font-family:var(--font-display);font-size:3.5rem;font-weight:700;letter-spacing:-.04em;color:var(--text);line-height:1;margin-bottom:1.5rem} .plan-features{list-style:none;margin-bottom:2rem;display:flex;flex-direction:column;gap:.75rem} .plan-features li::before{content:'✓ ';color:var(--brand)} .discount-chip{background:var(--brand-glow);color:var(--brand);font-size:.6rem;padding:.15rem .5rem;border-radius:99px;border:1px solid var(--brand)}
JS: document.querySelectorAll('.toggle-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.toggle-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const period=btn.dataset.period;document.querySelectorAll('.price-num').forEach(el=>{el.textContent=el.dataset[period]||el.textContent;});});});
@media(max-width:768px){.pricing-grid{grid-template-columns:1fr}}`,

  ASYMMETRIC: `
Alternating asymmetric section layouts — eliminates template look:
Odd sections: .asym-section:nth-child(odd) .asym-grid{grid-template-columns:1fr 1.45fr} (content left, visual right)
Even sections: .asym-section:nth-child(even) .asym-grid{grid-template-columns:1.45fr 1fr} (visual left, content right) + .asym-section:nth-child(even) .asym-content{order:2}
CSS: .asym-grid{display:grid;gap:5rem;align-items:center} .asym-visual{border-radius:var(--radius-lg);overflow:hidden;aspect-ratio:4/3;background:var(--bg-alt);border:1px solid var(--border);position:relative} @media(max-width:900px){.asym-grid{grid-template-columns:1fr!important}.asym-section:nth-child(even) .asym-content{order:0}}
HTML pattern: <section class="asym-section gsap-section"><div class="asym-grid"><div class="asym-content gsap-item"><div class="chip">About Us</div><h2 class="section-headline wipe-reveal">Headline Here</h2><p class="reveal-blur">Body text...</p><a class="btn-primary magnetic btn-arrow">Learn More <span class="arr">→</span></a></div><div class="asym-visual" data-cursor-text="VIEW"><div style="position:absolute;inset:0;background:linear-gradient(135deg,var(--brand-glow),transparent)"></div></div></div></section>`,

  MARQUEE: `
CSS marquee social proof bar:
HTML: <div class="marquee"><div class="marquee-inner">[items]<span>·</span>[same items again for seamless loop]</div></div>
CSS: .marquee{overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:1.2rem 0} .marquee-inner{display:flex;gap:3rem;width:max-content;animation:marquee 28s linear infinite;align-items:center} @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}} .marquee:hover .marquee-inner{animation-play-state:paused}
Content: "4.9★ Google Rating" · "3,200+ Projects Completed" · "$50M+ Revenue Generated" · "Featured in Forbes" (use real credible claims)`,

} as const

export type TechniqueKey = keyof typeof T

// ── Industry-specific section sequence planner ────────────────────────────────

export type SectionType =
  | "nav" | "hero" | "proof" | "services" | "features" | "about" | "stats"
  | "process" | "testimonials" | "pricing" | "gallery" | "team" | "cta" | "footer"
  | "faq" | "locations" | "results"

export function planSections(
  businessType: string,
  directives?: { sections?: string[]; mustInclude?: string[]; mustExclude?: string[] }
): SectionType[] {
  if (directives?.sections && directives.sections.length > 0) {
    return ["nav", ...directives.sections as SectionType[], "footer"]
  }

  const t = businessType.toLowerCase()

  if (/saas|software|platform|app|tool|ai|tech startup/i.test(t)) {
    return ["nav","hero","proof","features","about","pricing","testimonials","faq","cta","footer"]
  }
  if (/law|legal|attorney|lawyer|firm/i.test(t)) {
    return ["nav","hero","proof","services","results","process","team","testimonials","cta","footer"]
  }
  if (/restaurant|cafe|bakery|food|dining|bistro|pizza|sushi/i.test(t)) {
    return ["nav","hero","about","services","gallery","testimonials","locations","cta","footer"]
  }
  if (/gym|fitness|crossfit|yoga|wellness|spa|pilates|personal trainer/i.test(t)) {
    return ["nav","hero","proof","services","process","team","pricing","testimonials","cta","footer"]
  }
  if (/roofing|hvac|plumbing|electric|contractor|construction|landscaping/i.test(t)) {
    return ["nav","hero","proof","services","process","about","gallery","testimonials","cta","footer"]
  }
  if (/real estate|realty|property|homes|realtor/i.test(t)) {
    return ["nav","hero","proof","services","about","results","team","testimonials","cta","footer"]
  }
  if (/dental|dentist|clinic|doctor|medical|health|chiropractic/i.test(t)) {
    return ["nav","hero","proof","services","about","process","team","testimonials","cta","footer"]
  }
  if (/agency|design|creative|marketing|branding|studio/i.test(t)) {
    return ["nav","hero","proof","services","gallery","about","pricing","testimonials","cta","footer"]
  }
  if (/ecommerce|shop|store|retail|product/i.test(t)) {
    return ["nav","hero","proof","features","gallery","about","testimonials","cta","footer"]
  }

  return ["nav","hero","proof","services","about","process","testimonials","cta","footer"]
}

// ── Technique selector by business type and directives ────────────────────────

export function selectTechniques(
  businessType: string,
  sections: SectionType[],
  animationsEnabled: boolean | null
): TechniqueKey[] {
  if (animationsEnabled === false) {
    return ["REVEAL","NAV","MICRO","GRAIN","MARQUEE"]
  }

  const base: TechniqueKey[] = [
    "SCROLL_BAR","REVEAL","NAV","GSAP","KINETIC_TYPE","MAP_RANGE",
    "CURSOR","SHADER","LOADER","MAGNETIC","TILT","WIPE","MICRO","SCRUB","GRAIN","ASYMMETRIC",
  ]

  if (sections.includes("services") || sections.includes("gallery")) {
    base.push("H_SCROLL")
  }
  if (sections.includes("proof")) {
    base.push("MARQUEE")
  }
  if (sections.includes("process")) {
    const t = businessType.toLowerCase()
    if (/law|legal|medical|dental|contractor|roofing|hvac|construction|plumbing/i.test(t)) {
      base.push("SVG_TIMELINE")
    }
  }
  if (sections.includes("pricing")) {
    base.push("PRICING")
  }

  return base
}

// ── Assemble selected technique reference block ───────────────────────────────

export function buildTechniqueBlock(keys: TechniqueKey[]): string {
  return keys
    .map((k, i) => `━━━ T${String(i + 1).padStart(2,"0")}: ${k} ━━━${T[k]}`)
    .join("\n")
}
