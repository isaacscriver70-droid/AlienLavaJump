// =======================================================================
// AUDIO ENGINE - every sound here is synthesized at runtime with the
// Web Audio API (oscillators + filtered noise). No external sound
// files are used anywhere in this game.
// =======================================================================
const SFX=(function(){
  let ctx=null;
  let muted=false;
  let droneNodes=null;
  let breathNodes=null;

  function ensureCtx(){
    if(!ctx) ctx=new (window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==="suspended") ctx.resume();
    return ctx;
  }

  function noiseBuffer(duration){
    const c=ensureCtx();
    const buf=c.createBuffer(1, c.sampleRate*duration, c.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    return buf;
  }

  function master(){
    const c=ensureCtx();
    const g=c.createGain();
    g.gain.value=muted?0:1;
    g.connect(c.destination);
    return g;
  }

  function tone(freq,dur,type,vol,glideTo){
    if(muted) return;
    const c=ensureCtx();
    const osc=c.createOscillator();
    const g=c.createGain();
    osc.type=type||"sine";
    osc.frequency.setValueAtTime(freq,c.currentTime);
    if(glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo,c.currentTime+dur);
    g.gain.setValueAtTime(vol||.25,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dur);
    osc.connect(g); g.connect(master());
    osc.start(); osc.stop(c.currentTime+dur+.02);
  }

  function noiseBurst(dur,filterFreq,vol){
    if(muted) return;
    const c=ensureCtx();
    const src=c.createBufferSource();
    src.buffer=noiseBuffer(dur);
    const filt=c.createBiquadFilter();
    filt.type="bandpass";
    filt.frequency.value=filterFreq||800;
    filt.Q.value=.7;
    const g=c.createGain();
    g.gain.setValueAtTime(vol||.3,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+dur);
    src.connect(filt); filt.connect(g); g.connect(master());
    src.start();
  }

  function buttonClick(){
    if(muted) return;
    const c=ensureCtx();
    // mechanical "thunk" - a short, punchy filtered-noise compression
    const src=c.createBufferSource();
    src.buffer=noiseBuffer(0.09);
    const filt=c.createBiquadFilter(); filt.type="lowpass"; filt.frequency.value=850;
    const g=c.createGain();
    g.gain.setValueAtTime(.55,c.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.09);
    src.connect(filt); filt.connect(g); g.connect(master());
    src.start();
    // low body thump under the thunk
    tone(65,.13,"sine",.16,42);
    // spring-loaded release tick, a beat later
    setTimeout(()=>{ if(!muted) noiseBurst(.025,4200,.2); },40);
  }
  function footstep(){ noiseBurst(.05+Math.random()*.03,170+Math.random()*90,.15+Math.random()*.07); }
  function monsterFootstep(){ noiseBurst(.09+Math.random()*.04,90+Math.random()*40,.22+Math.random()*.05); }
  function doorOpen(){
    if(muted) return;
    const c=ensureCtx();
    // creaky hinge - slow pitch-bending filtered noise, plus a low wood groan
    const src=c.createBufferSource();
    src.buffer=noiseBuffer(0.9);
    const filt=c.createBiquadFilter(); filt.type="bandpass";
    filt.frequency.setValueAtTime(300,c.currentTime);
    filt.frequency.exponentialRampToValueAtTime(900,c.currentTime+0.6);
    filt.frequency.exponentialRampToValueAtTime(500,c.currentTime+0.9);
    filt.Q.value=6;
    const g=c.createGain();
    g.gain.setValueAtTime(.001,c.currentTime);
    g.gain.linearRampToValueAtTime(.22,c.currentTime+.15);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.9);
    src.connect(filt); filt.connect(g); g.connect(master());
    src.start();
    tone(50,1,"sawtooth",.12,38);
  }
  function doorClose(){ noiseBurst(.12,300,.3); tone(45,.2,"sine",.15,30); }
  function lightBuzzOn(){ tone(220,.4,"square",.05); }
  function stinger(){
    noiseBurst(.5,1200,.5);
    tone(55,.7,"sawtooth",.4,30);
    tone(900,.15,"square",.2);
  }
  function monsterGrowl(){
    if(muted) return;
    const c=ensureCtx();
    const src=c.createBufferSource();
    src.buffer=noiseBuffer(1.1);
    const filt=c.createBiquadFilter(); filt.type="lowpass";
    filt.frequency.setValueAtTime(220,c.currentTime);
    filt.frequency.exponentialRampToValueAtTime(80,c.currentTime+1.0);
    const g=c.createGain();
    g.gain.setValueAtTime(.001,c.currentTime);
    g.gain.linearRampToValueAtTime(.35,c.currentTime+.2);
    g.gain.exponentialRampToValueAtTime(.001,c.currentTime+1.1);
    src.connect(filt); filt.connect(g); g.connect(master());
    src.start();
    tone(38,1.1,"sawtooth",.22,26);
  }
  function thud(){ noiseBurst(.3,120,.4); }
  function whisper(){ noiseBurst(1.2,2400,.06); }
  function flashlightClick(){ noiseBurst(.02,3500,.18); tone(2200,.02,"square",.08); }
  function voiceBlip(){
    tone(600,.08,"square",.2,900);
    setTimeout(()=>tone(500,.08,"square",.2,850),90);
  }
  function staticBurst(dur){ noiseBurst(dur||.4,3000,.15); }
  function glitchBeep(){ tone(1200,.05,"square",.15); }

  function startDrone(){
    if(muted||droneNodes) return;
    const c=ensureCtx();
    const osc=c.createOscillator();
    const osc2=c.createOscillator();
    const g=c.createGain();
    osc.type="sine"; osc.frequency.value=48;
    osc2.type="sine"; osc2.frequency.value=50.5;
    g.gain.value=.05;
    osc.connect(g); osc2.connect(g); g.connect(master());
    osc.start(); osc2.start();
    droneNodes={osc,osc2,g};
  }
  function stopDrone(){
    if(!droneNodes) return;
    try{ droneNodes.osc.stop(); droneNodes.osc2.stop(); }catch(e){}
    droneNodes=null;
  }
  function setDroneIntensity(t){ // t = 0..1, gets louder/lower as danger rises
    if(!droneNodes) return;
    droneNodes.g.gain.setTargetAtTime(.03+t*.14, ensureCtx().currentTime, .5);
    droneNodes.osc.frequency.setTargetAtTime(48-t*10, ensureCtx().currentTime, 1);
  }

  function startBreathing(){
    if(muted||breathNodes) return;
    const c=ensureCtx();
    const src=c.createBufferSource();
    src.buffer=noiseBuffer(2); src.loop=true;
    const filt=c.createBiquadFilter(); filt.type="lowpass"; filt.frequency.value=400;
    const g=c.createGain(); g.gain.value=0;
    const lfo=c.createOscillator(); lfo.frequency.value=.3;
    const lfoGain=c.createGain(); lfoGain.gain.value=.04;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(filt); filt.connect(g); g.connect(master());
    src.start(); lfo.start();
    breathNodes={src,g,lfo};
  }
  function stopBreathing(){
    if(!breathNodes) return;
    try{ breathNodes.src.stop(); breathNodes.lfo.stop(); }catch(e){}
    breathNodes=null;
  }
  function setBreathingVolume(v){ if(breathNodes) breathNodes.g.gain.setTargetAtTime(v, ensureCtx().currentTime, .3); }

  function setMuted(v){
    muted=v;
    if(muted) { stopDrone(); stopBreathing(); }
  }

  return {
    ensureCtx, buttonClick, footstep, monsterFootstep, doorOpen, doorClose, lightBuzzOn, stinger, thud,
    whisper, voiceBlip, staticBurst, glitchBeep, flashlightClick, monsterGrowl,
    startDrone, stopDrone, setDroneIntensity,
    startBreathing, stopBreathing, setBreathingVolume,
    setMuted
  };
})();
window.SFX=SFX;
