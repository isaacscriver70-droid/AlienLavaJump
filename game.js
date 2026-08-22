// =======================================================================
// DON'T LOOK BEHIND YOU — core game.
// One continuous Three.js scene: hallway generation, first-person
// controls, the button + its effects, a monster, level escalation,
// a chase, secret buttons, and 4 endings.
// =======================================================================

// ---- Renderer / scene ------------------------------------------------
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0x050506,3,24);
const baseFogColor=scene.fog.color.clone();

const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.08,100);
const baseFov=camera.fov;
const STARTZ=3;
camera.position.set(0,1.6,STARTZ);

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
document.getElementById("scene-container").appendChild(renderer.domElement);

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});

// ---- Lighting ----------------------------------------------------------
const ambient=new THREE.AmbientLight(0x445533,0.02);
scene.add(ambient);
const flashlight=new THREE.PointLight(0xd9e8c9,0,4.5);
camera.add(flashlight); flashlight.position.set(0,0,0.2);
scene.add(camera);

let lightsOn=false;
const ceilingLights=[]; // {light, baseIntensity}

function setLights(on){
  lightsOn=on;
  ambient.intensity=on?0.16:0.02;
  ceilingLights.forEach(l=>{ l.light.intensity=on?l.baseIntensity:0; });
  secretButtonDark.visible=!on;
  if(on) SFX.lightBuzzOn();
}

// ---- Materials / procedural textures -----------------------------------
function canvasTexture(draw,w,h){
  const c=document.createElement("canvas"); c.width=w; c.height=h;
  draw(c.getContext("2d"),w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
const floorTex=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle="#0c0c0a"; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#1c1c16"; ctx.lineWidth=2;
  for(let i=0;i<=4;i++){ ctx.beginPath(); ctx.moveTo(i*w/4,0); ctx.lineTo(i*w/4,h); ctx.stroke(); }
},128,128);
floorTex.repeat.set(1,1);

const wallMatNormal=new THREE.MeshStandardMaterial({color:0x171712,roughness:0.95});
const wallMatDistorted=new THREE.MeshStandardMaterial({color:0x2b1414,roughness:0.9,emissive:0x330000,emissiveIntensity:0.15});
const floorMat=new THREE.MeshStandardMaterial({color:0x0c0c0a,roughness:1,map:floorTex});
const ceilingMat=new THREE.MeshStandardMaterial({color:0x08080a,roughness:1});
const doorMat=new THREE.MeshStandardMaterial({color:0x241a12,roughness:0.8});

// ---- Hallway ------------------------------------------------------------
const CORR_W=3, CORR_H=2.8, SEG_LEN=4;
const hallwayGroup=new THREE.Group();
scene.add(hallwayGroup);
const wallMeshes=[]; // for distortion / breathing fx
let segCount=0;
let hallwayEndZ=0; // most-negative Z built so far

function buildSegment(z){
  const g=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(CORR_W,0.2,SEG_LEN),floorMat);
  floor.position.set(0,-0.1,z); g.add(floor);
  const ceil=new THREE.Mesh(new THREE.BoxGeometry(CORR_W,0.2,SEG_LEN),ceilingMat);
  ceil.position.set(0,CORR_H,z); g.add(ceil);
  [-1,1].forEach(side=>{
    const wall=new THREE.Mesh(new THREE.BoxGeometry(0.2,CORR_H,SEG_LEN),wallMatNormal);
    wall.position.set(side*(CORR_W/2),CORR_H/2,z);
    g.add(wall); wallMeshes.push(wall);
  });
  if(segCount%2===0){
    const pl=new THREE.PointLight(0xd9e8c9,0.85,6.5);
    pl.position.set(0,CORR_H-0.25,z);
    g.add(pl);
    ceilingLights.push({light:pl,baseIntensity:0.85});
  }
  if(segCount%5===3){
    const door=new THREE.Mesh(new THREE.BoxGeometry(0.9,1.9,0.08),doorMat);
    const side=Math.random()<0.5?-1:1;
    door.position.set(side*(CORR_W/2-0.05),0.95,z);
    door.userData.isDoor=true;
    g.add(door);
  }
  hallwayGroup.add(g);
  segCount++;
  return z;
}
function extendHallway(numSegments){
  for(let i=0;i<numSegments;i++){
    hallwayEndZ-=SEG_LEN;
    buildSegment(hallwayEndZ);
  }
}
extendHallway(14);

// Final door at the far end
const finalDoor=new THREE.Mesh(
  new THREE.BoxGeometry(1.6,2.3,0.15),
  new THREE.MeshStandardMaterial({color:0x0d0f0a,roughness:0.6,emissive:0x1a2a12,emissiveIntensity:0.05})
);
function placeFinalDoor(){ finalDoor.position.set(0,1.15,hallwayEndZ-1.4); }
placeFinalDoor();
scene.add(finalDoor);

// ---- The main button ------------------------------------------------
function makeButtonMesh(color){
  const g=new THREE.Group();
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.32,0.05),new THREE.MeshStandardMaterial({color:0x1a1a16}));
  const btn=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,0.06,16),
    new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.4}));
  btn.rotation.x=Math.PI/2; btn.position.z=0.05;
  g.add(plate,btn);
  return g;
}
const mainButton=makeButtonMesh(0xc81e2b);
function placeMainButtonAt(z,side){
  mainButton.position.set(side*(CORR_W/2-0.03),1.3,z);
  mainButton.rotation.y=side>0?-Math.PI/2:Math.PI/2;
}
placeMainButtonAt(-6,1);
scene.add(mainButton);

function relocateMainButton(){
  const z=hallwayEndZ+ (Math.random()*(camera.position.z-hallwayEndZ-4))-2;
  placeMainButtonAt(Math.min(z,-4),Math.random()<0.5?-1:1);
}

// ---- Story-beat props (spawned by scripted presses) --------------------
const secondButton=makeButtonMesh(0x2b7ac8); secondButton.visible=false; scene.add(secondButton);
const dontPressButton=makeButtonMesh(0xd4b106); dontPressButton.visible=false; scene.add(dontPressButton);

// ---- Secret buttons ------------------------------------------------------
const secretPainting=(function(){
  const tex=canvasTexture((ctx,w,h)=>{
    ctx.fillStyle="#3a2a1a"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle="#171008"; ctx.fillRect(6,6,w-12,h-12);
    ctx.strokeStyle="#000"; ctx.strokeRect(3,3,w-6,h-6);
  },64,96);
  const frame=new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.8),new THREE.MeshStandardMaterial({map:tex}));
  return frame;
})();
scene.add(secretPainting);
const secretButtonPainting=makeButtonMesh(0xd4b106);
secretButtonPainting.scale.set(0.6,0.6,0.6);
scene.add(secretButtonPainting);
function placeSecretPainting(){
  const z=-14, side=-1;
  secretPainting.position.set(side*(CORR_W/2-0.06),1.4,z);
  secretPainting.rotation.y=Math.PI/2;
  secretButtonPainting.position.set(side*(CORR_W/2-0.09),1.15,z+0.15);
  secretButtonPainting.rotation.y=Math.PI/2;
}
placeSecretPainting();

const secretButtonFloor=makeButtonMesh(0xc81e2b);
secretButtonFloor.scale.set(0.5,0.5,0.5);
secretButtonFloor.rotation.x=-Math.PI/2;
secretButtonFloor.position.set(0.6,-0.02,-22);
scene.add(secretButtonFloor);

const secretButtonDark=makeButtonMesh(0x2b7ac8);
secretButtonDark.position.set(-1.35,1.2,-30);
secretButtonDark.rotation.y=Math.PI/2;
secretButtonDark.visible=false;
scene.add(secretButtonDark);

const secretButtonBackward=makeButtonMesh(0xaa55ff);
secretButtonBackward.position.set(1.35,1.2,-9);
secretButtonBackward.rotation.y=-Math.PI/2;
secretButtonBackward.visible=false;
scene.add(secretButtonBackward);

const secretButtonBehind=makeButtonMesh(0x151515);
secretButtonBehind.visible=false;
scene.add(secretButtonBehind);
let behindButtonSpawned=false;

// ---- Duck / chicken / prop helpers --------------------------------------
function spawnDuck(x,z){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),new THREE.MeshStandardMaterial({color:0xd4b106}));
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,8),new THREE.MeshStandardMaterial({color:0xd4b106}));
  head.position.set(0,0.18,0.1);
  g.add(body,head); g.position.set(x,0.15,z);
  scene.add(g);
  return g;
}
function spawnChickens(centerZ){
  const chickens=[];
  for(let i=0;i<40;i++){
    const c=new THREE.Mesh(new THREE.SphereGeometry(0.12,6,6),new THREE.MeshStandardMaterial({color:0xe8e0c8}));
    c.position.set((Math.random()-0.5)*CORR_W*0.8,0.1,centerZ-Math.random()*20);
    scene.add(c); chickens.push(c);
  }
  SFX.chickenCluck();
  return chickens;
}

// ---- Monster --------------------------------------------------------------
const monster=(function(){
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:0x020202,roughness:1});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.42,1.5,0.28),mat); torso.position.y=1.05;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,8),mat); head.position.y=1.95;
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.1,1.1,0.1),mat); armL.position.set(-0.32,0.9,0);
  const armR=armL.clone(); armR.position.x=0.32;
  g.add(torso,head,armL,armR);
  g.visible=false;
  scene.add(g);
  return g;
})();
function showMonsterAt(x,z){ monster.position.set(x,0,z); monster.visible=true; }
function hideMonster(){ monster.visible=false; }
function monsterPeek(x,z,duration){
  showMonsterAt(x,z);
  setTimeout(hideMonster,duration||220);
}

// ---- Player state ---------------------------------------------------------
let yaw=0, pitch=0; // yaw=0 means camera looks down -Z, i.e. forward into the hallway
const keys={};
let running=false;
let reverseUntil=0;
let distanceAccum=0;
let paused=false;
let gameEnded=false;
let mouseSensitivity=0.0022;

addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="ShiftLeft"||e.code==="ShiftRight") running=true;
  if(e.code==="Space"){ e.preventDefault(); tryInteract(); }
  if(e.code==="Escape"){ togglePause(); }
});
addEventListener("keyup",e=>{
  keys[e.code]=false;
  if(e.code==="ShiftLeft"||e.code==="ShiftRight") running=false;
});

const blocker=document.getElementById("blocker");
const hud=document.getElementById("hud");
blocker.addEventListener("click",()=>{
  SFX.ensureCtx();
  renderer.domElement.requestPointerLock();
});
document.addEventListener("pointerlockchange",()=>{
  if(document.pointerLockElement===renderer.domElement){
    blocker.style.display="none"; hud.style.display="block";
    document.getElementById("pause-menu").style.display="none";
    paused=false;
    if(!gameStarted){ gameStarted=true; onGameStart(); }
  }else if(!gameEnded){
    document.getElementById("pause-menu").style.display="flex";
    paused=true;
  }
});
document.addEventListener("mousemove",e=>{
  if(document.pointerLockElement!==renderer.domElement) return;
  yaw-=e.movementX*mouseSensitivity;
  pitch-=e.movementY*mouseSensitivity;
  pitch=Math.max(-1.2,Math.min(1.2,pitch));
});
document.getElementById("resume-btn").addEventListener("click",()=>renderer.domElement.requestPointerLock());

let gameStarted=false;
function togglePause(){
  if(gameEnded) return;
  if(document.pointerLockElement===renderer.domElement) document.exitPointerLock();
}

// ---- Caption / UI helpers --------------------------------------------
const captionEl=document.getElementById("caption");
let captionQueue=[];
let captionBusy=false;
function showCaption(text,opts){
  captionQueue.push({text,opts:opts||{}});
  if(!captionBusy) processCaptionQueue();
}
function processCaptionQueue(){
  if(captionQueue.length===0){ captionBusy=false; return; }
  captionBusy=true;
  const {text,opts}=captionQueue.shift();
  captionEl.textContent=text;
  captionEl.className=opts.warn?"show warn":"show";
  setTimeout(()=>{
    captionEl.classList.remove("show");
    setTimeout(processCaptionQueue,220);
  },opts.duration||2200);
}

const promptEl=document.getElementById("interact-prompt");
const counterEl=document.getElementById("press-count");
const counterWrapEl=document.getElementById("button-counter");

// ---- Interactables ------------------------------------------------------
let currentInteractable=null;
function getInteractables(){
  const list=[
    {mesh:mainButton,range:2.0,visible:true,label:"[ SPACE ] PRESS THE BUTTON",onPress:pressMainButton},
    {mesh:secondButton,range:1.8,visible:secondButton.visible,label:"[ SPACE ] PRESS THE OTHER BUTTON",onPress:pressSecondButton},
    {mesh:dontPressButton,range:1.8,visible:dontPressButton.visible,label:"[ SPACE ] ??? (YOU PROBABLY SHOULDN'T)",onPress:pressDontPressButton},
    {mesh:secretButtonPainting,range:1.6,visible:true,label:"[ SPACE ] PRESS IT",onPress:pressPaintingButton},
    {mesh:secretButtonFloor,range:1.2,visible:true,label:"[ SPACE ] THIS SEEMS UNWISE",onPress:pressFloorButton},
    {mesh:secretButtonDark,range:1.6,visible:!lightsOn,label:"[ SPACE ] PRESS IT",onPress:pressDarkButton},
    {mesh:secretButtonBackward,range:1.6,visible:secretButtonBackward.visible,label:"[ SPACE ] PRESS IT",onPress:pressBackwardButton},
    {mesh:secretButtonBehind,range:1.6,visible:secretButtonBehind.visible,label:"[ SPACE ] YOU FOUND IT.",onPress:pressBehindButton},
  ];
  return list;
}
function updateInteractionPrompt(){
  let best=null, bestDist=Infinity;
  getInteractables().forEach(it=>{
    if(!it.visible) return;
    const d=camera.position.distanceTo(it.mesh.position);
    if(d<it.range && d<bestDist){ bestDist=d; best=it; }
  });
  currentInteractable=best;
  if(best){ promptEl.textContent=best.label; promptEl.classList.add("show"); }
  else promptEl.classList.remove("show");
}
function tryInteract(){
  if(paused||gameEnded||!currentInteractable) return;
  currentInteractable.onPress();
}

// ---- Press counter / scripted sequence -----------------------------------
let pressCount=0;
let counterStuckAt=0;
let stuckPresses=0;
function updateCounterDisplay(){
  if(counterStuckAt){
    counterEl.textContent=counterStuckAt;
    counterWrapEl.classList.add("glitching");
  }else{
    counterEl.textContent=pressCount;
    counterWrapEl.classList.remove("glitching");
  }
}

const SCRIPTED_EFFECTS=[
  null, // index 0 unused
  ()=>{ setLights(true); showCaption("The lights turn on."); },
  ()=>{ const doors=hallwayGroup.children.flatMap(g=>g.children).filter(c=>c.userData.isDoor);
        if(doors.length){ const d=doors[Math.floor(Math.random()*doors.length)]; d.rotation.y-=1.3; SFX.doorOpen(); }
        showCaption("A door opens somewhere nearby."); },
  ()=>{ extendHallway(6); placeFinalDoor(); showCaption("The hallway gets longer."); },
  ()=>{ spawnDuck(camera.position.x, camera.position.z-3); showCaption("A duck appears."); },
  ()=>{ setLights(false); showCaption("The lights turn off.",{warn:true}); },
  ()=>{ SFX.thud(); showCaption("A loud noise happens behind you.",{warn:true}); bumpProximity(0.06); },
  ()=>{ relocateMainButton(); showCaption("The button moves somewhere else."); },
  ()=>{ showCaption('"Did you hear that?"'); },
  ()=>{ showCaption("Nothing happens."); },
  ()=>{ triggerHallwayChanges(); showCaption("Something is different now.",{warn:true}); },
  ()=>{ secondButton.visible=true; placeMainRelative(secondButton,-2); showCaption("A second button appears."); },
  ()=>{ dontPressButton.visible=true; placeMainRelative(dontPressButton,-2.6);
        showCaption('One of the buttons now says: "DON\'T PRESS ME."',{duration:2800}); },
];
function placeMainRelative(mesh,dz){
  mesh.position.set(mainButton.position.x*-1,1.3,mainButton.position.z+dz);
  mesh.rotation.y=mainButton.position.x>0?Math.PI/2:-Math.PI/2;
}

let level=1;
function computeLevel(){
  if(pressCount<=12) return 1;
  return Math.min(5, 2+Math.floor((pressCount-13)/7));
}

function pressMainButton(){
  if(counterStuckAt){
    stuckPresses++;
    SFX.glitchBeep();
    updateCounterDisplay();
    if(stuckPresses===3) showCaption("STOP.",{warn:true,duration:1600});
    if(stuckPresses>=4){ counterStuckAt=0; stuckPresses=0; updateCounterDisplay(); }
    return;
  }
  pressCount++;
  SFX.buttonClick();
  updateCounterDisplay();
  const newLevel=computeLevel();
  if(newLevel!==level){ level=newLevel; onLevelChange(level); }

  if(pressCount===40){ counterStuckAt=40; updateCounterDisplay(); return; }

  if(pressCount<=12){ SCRIPTED_EFFECTS[pressCount](); }
  else{ runRandomEffect(); }

  if(pressCount===16) startBaitSequence();
}

function pressSecondButton(){
  SFX.buttonClick();
  const pool=[
    ()=>showCaption("That did something. Probably."),
    ()=>{ spawnDuck(camera.position.x,camera.position.z-3); showCaption("Another duck."); },
    ()=>{ SFX.stinger(); showCaption("...",{warn:true}); bumpProximity(0.04); },
  ];
  pool[Math.floor(Math.random()*pool.length)]();
}
function pressDontPressButton(){
  SFX.stinger();
  showMonsterAt(camera.position.x, camera.position.z-1.6);
  setTimeout(hideMonster,260);
  bumpProximity(0.35);
  showCaption("YOU WERE WARNED.",{warn:true,duration:2600});
}

function pressPaintingButton(){
  SFX.buttonClick();
  spawnChickens(secretButtonPainting.position.z);
  hideMonster();
  showCaption("ONE HUNDRED CHICKENS APPEAR.",{duration:2000});
  setTimeout(()=>endGame("stupid"),2200);
}
function pressFloorButton(){
  SFX.stinger();
  showMonsterAt(camera.position.x+0.3, camera.position.z-1.1);
  bumpProximity(0.5);
  showCaption("YOU PROBABLY SHOULDN'T HAVE DONE THAT.",{warn:true,duration:2400});
  let flashes=0;
  const iv=setInterval(()=>{
    monster.visible=!monster.visible; flashes++;
    if(flashes>5){ clearInterval(iv); hideMonster(); }
  },180);
}
function pressDarkButton(){
  SFX.buttonClick();
  setLights(true);
  flashlight.intensity=2.2;
  clearTimeout(flashlight._timer);
  flashlight._timer=setTimeout(()=>flashlight.intensity=0,15000);
  showCaption("You feel a little safer.");
}
function pressBackwardButton(){
  SFX.buttonClick();
  reverseUntil=performance.now()+9000;
  showCaption("The controls feel wrong now.",{warn:true});
}
function pressBehindButton(){
  SFX.stinger();
  triggerSecretEnding();
}

function bumpProximity(amount){ proximity=Math.min(1,proximity+amount); }

// ---- Random effect pool (post scripted-intro, weighted by level) --------
function triggerHallwayChanges(){
  const until=performance.now()+4500;
  wallMeshes.forEach(w=>w.material=wallMatDistorted);
  scene.fog.color.setHex(0x2a0808);
  const check=()=>{
    if(performance.now()<until) return requestAnimationFrame(check);
    wallMeshes.forEach(w=>w.material=wallMatNormal);
    scene.fog.color.copy(baseFogColor);
  };
  check();
}
let breatheUntil=0;
function makeWallsBreathe(){ breatheUntil=performance.now()+6000; showCaption("The walls are breathing.",{warn:true}); }
let hallwaySquashUntil=0, hallwaySquashDir=1;
function resizeHallway(dir){
  hallwaySquashDir=dir; hallwaySquashUntil=performance.now()+5000;
  showCaption(dir>0?"Everything got huge.":"The hallway feels tiny now.");
}

const GREEN=[
  ()=>{ flashlight.intensity=2.2; clearTimeout(flashlight._timer); flashlight._timer=setTimeout(()=>flashlight.intensity=0,14000); showCaption("You've got a flashlight now."); },
  ()=>{ const doors=hallwayGroup.children.flatMap(g=>g.children).filter(c=>c.userData.isDoor);
        if(doors.length){ doors[Math.floor(Math.random()*doors.length)].rotation.y-=1.3; SFX.doorOpen(); }
        showCaption("The next door swings open."); },
  ()=>{ hideMonster(); proximity=Math.max(0,proximity-0.25); showCaption("It feels further away now."); },
  ()=>{ runSpeedUntil=performance.now()+8000; showCaption("You feel faster."); },
  ()=>{ setLights(true); showCaption("The lights come back on."); },
];
const YELLOW=[
  ()=>{ for(let i=0;i<3;i++) spawnDuck(camera.position.x+(Math.random()-0.5)*2,camera.position.z-2-Math.random()*4);
        showCaption("Random objects appear."); },
  ()=>{ reverseUntil=performance.now()+8000; showCaption("Your controls just reversed.",{warn:true}); },
  ()=>{ resizeHallway(-1); },
  ()=>{ resizeHallway(1); },
  ()=>{ SFX.stopDrone(); SFX.startDrone(); showCaption("The music changed."); },
  ()=>{ makeWallsBreathe(); },
];
const RED=[
  ()=>{ showMonsterAt(camera.position.x,camera.position.z-6); setTimeout(hideMonster,900); SFX.stinger(); bumpProximity(0.18); showCaption("Something is here with you.",{warn:true}); },
  ()=>{ setLights(false); showCaption("The lights go out.",{warn:true}); },
  ()=>{ showCaption("You hear the doors lock.",{warn:true}); bumpProximity(0.05); },
  ()=>{ extendHallway(6); placeFinalDoor(); showCaption("The hallway just got longer.",{warn:true}); },
  ()=>{ SFX.footstep(); SFX.footstep(); showCaption("Footsteps. Not yours.",{warn:true}); bumpProximity(0.1); },
  ()=>{ bumpProximity(0.22); showCaption("It's getting closer.",{warn:true}); },
  ()=>{ flashlight.intensity=0; showCaption("Your flashlight just died.",{warn:true}); },
];
const PURPLE=[
  ()=>{ SFX.staticBurst(0.5); showCaption("A random explosion happens. You are fine."); },
  ()=>{ SFX.stopDrone(); showCaption("Elevator music plays for a moment."); setTimeout(()=>SFX.startDrone(),4000); },
  ()=>{ showCaption("The hallway briefly looks like a supermarket."); },
  ()=>{ showCaption("You now have a banana."); },
  ()=>{ SFX.chickenCluck(); showCaption("Your character's voice changed."); },
  ()=>{ showCaption('"bruh"'); },
  ()=>{ showCaption("The button did absolutely nothing."); },
];
function runRandomEffect(){
  const weights=level<=2?{g:.35,y:.35,r:.2,p:.1}
    :level===3?{g:.2,y:.3,r:.35,p:.15}
    :level===4?{g:.12,y:.23,r:.5,p:.15}
    :{g:.08,y:.17,r:.6,p:.15};
  const roll=Math.random();
  let pool,acc=0;
  for(const k of ["g","y","r","p"]){
    acc+=weights[k];
    if(roll<=acc){ pool=({g:GREEN,y:YELLOW,r:RED,p:PURPLE})[k]; break; }
  }
  if(!pool) pool=RED;
  pool[Math.floor(Math.random()*pool.length)]();
}
let runSpeedUntil=0;

// ---- Level escalation ----------------------------------------------------
function onLevelChange(lvl){
  if(lvl===2) showCaption("Something feels different.",{warn:true});
  if(lvl===3) showCaption("Something is wrong.",{warn:true});
  if(lvl===4) showCaption("DON'T LOOK BEHIND YOU.",{warn:true,duration:2600});
  if(lvl===4 && !secretButtonDark.visible){ /* dark button already gated by lightsOn */ }
  if(lvl===3){ secretButtonBackward.visible=true; }
  if(lvl===4 && !behindButtonSpawned){ spawnBehindButton(); }
  if(lvl===5) startChase();
}

function spawnBehindButton(){
  behindButtonSpawned=true;
  secretButtonBehind.position.set(camera.position.x, 1.2, camera.position.z+4);
  secretButtonBehind.rotation.y=Math.PI;
  secretButtonBehind.visible=true;
  showCaption("You feel like something is behind you now.",{warn:true});
}

// ---- The bait sequence (spec's "HEY! TURN AROUND" moment) ---------------
let baitActive=false, baitLooked=false;
function startBaitSequence(){
  baitActive=true; baitLooked=false;
  showCaption("HEY!",{warn:true,duration:1600});
  setTimeout(()=>showCaption("HEY! TURN AROUND!",{warn:true,duration:1800}),2000);
  setTimeout(()=>showCaption("PLEASE.",{warn:true,duration:1800}),4200);
  setTimeout(()=>{ baitActive=false; },6200);
}

// ---- Look-behind tracking / bad ending ------------------------------------
let lookingBehind=false;
let lookBehindCount=0;
let baitPayoffPending=false;
function updateLookBehind(){
  const facingBackward=Math.cos(yaw)<-0.55; // true when yaw is within ~56° of PI (facing back down the hallway)
  if(facingBackward && !lookingBehind){
    lookingBehind=true;
    lookBehindCount++;
    if(baitActive){ baitLooked=true; }
    else if(baitLooked && !baitActive && !baitPayoffPending){
      baitPayoffPending=true;
    }
    if(level>=3 && lookBehindCount>8 && !gameEnded){ endGame("bad"); }
  }else if(!facingBackward && lookingBehind){
    lookingBehind=false;
    if(baitPayoffPending){
      baitPayoffPending=false;
      monsterPeek(camera.position.x, camera.position.z-3.2, 260);
      SFX.stinger();
      showCaption("The monster is suddenly much closer.",{warn:true});
      bumpProximity(0.3);
    }
  }
}

// ---- Chase sequence --------------------------------------------------
let chaseActive=false, chaseStart=0;
function startChase(){
  if(chaseActive) return;
  chaseActive=true; chaseStart=performance.now();
  setLights(false);
  SFX.thud();
  showCaption("BOOM.",{warn:true,duration:1400});
  setTimeout(()=>{
    showMonsterAt(camera.position.x, camera.position.z-8);
    showCaption("RUN.",{warn:true,duration:1800});
  },1200);
}
function updateChase(delta){
  if(!chaseActive) return;
  const t=(performance.now()-chaseStart)/1000;
  const speed=1.1+Math.min(2.2,t*0.05);
  const dir=new THREE.Vector3(camera.position.x-monster.position.x,0,camera.position.z-monster.position.z).normalize();
  monster.position.addScaledVector(dir,speed*delta);
  monster.lookAt(camera.position.x,monster.position.y,camera.position.z);
  proximity=Math.min(1,0.5+t*0.02);
  const d=monster.position.distanceTo(camera.position);
  if(d<1.1){ endGame("bad"); }
}

// ---- Proximity-driven ambience -------------------------------------------
let proximity=0;
function updateAmbience(delta){
  SFX.setDroneIntensity(proximity);
  SFX.setBreathingVolume(proximity*0.5);
  document.getElementById("vignette-danger").style.boxShadow=
    `inset 0 0 ${140+proximity*120}px ${20+proximity*60}px rgba(200,30,43,${proximity*0.55})`;
  if(!chaseActive && Math.random()<proximity*delta*0.4){
    const r=Math.random();
    if(r<0.4) SFX.footstep();
    else if(r<0.7) SFX.whisper();
    else monsterPeek(camera.position.x+(Math.random()-0.5)*2, camera.position.z-6-Math.random()*4,180);
  }
  if(!chaseActive && lightsOn && Math.random()<proximity*delta*0.15){
    ambient.intensity=0.02; setTimeout(()=>{ if(lightsOn) ambient.intensity=0.16; },90);
  }
}

// ---- Ending / fade --------------------------------------------------------
function endGame(kind){
  if(gameEnded) return;
  gameEnded=true;
  document.exitPointerLock();
  const fade=document.getElementById("fade");
  fade.classList.add("show");
  if(kind==="good") SFX.buttonClick();
  else SFX.stinger();
  setTimeout(()=>{ location.href="ending-"+kind+".html"; },1500);
}
function triggerSecretEnding(){
  if(gameEnded) return;
  showCaption("THE HALLWAY IS BREAKING.",{warn:true,duration:2200});
  wallMeshes.forEach(w=>w.material=wallMatDistorted);
  for(let i=0;i<10;i++){
    const b=makeButtonMesh(0xc81e2b);
    b.position.set((Math.random()-0.5)*CORR_W,1.1+Math.random(),camera.position.z-Math.random()*20-2);
    scene.add(b);
  }
  setTimeout(()=>showCaption("THE BUTTON IS BEHIND YOU.",{warn:true,duration:2000}),2400);
  setTimeout(()=>showCaption("You turn around.",{duration:1800}),4600);
  setTimeout(()=>showCaption('"Congratulations."',{duration:2000}),6600);
  setTimeout(()=>endGame("secret"),8800);
}

// ---- Main loop ----------------------------------------------------
const clock=new THREE.Clock();
function onGameStart(){ SFX.startDrone(); SFX.startBreathing(); }

function animate(){
  requestAnimationFrame(animate);
  const delta=Math.min(0.05,clock.getDelta());
  if(paused||gameEnded){ renderer.render(scene,camera); return; }

  camera.rotation.order="YXZ";
  camera.rotation.y=yaw; camera.rotation.x=pitch;

  // movement
  const forward=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,yaw,0));
  const right=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(0,yaw,0));
  let moveZ=0, moveX=0;
  if(keys["KeyW"]||keys["ArrowUp"]) moveZ+=1;
  if(keys["KeyS"]||keys["ArrowDown"]) moveZ-=1;
  if(keys["KeyD"]) moveX+=1;
  if(keys["KeyA"]) moveX-=1;
  const reversed=performance.now()<reverseUntil;
  if(reversed){ moveZ*=-1; moveX*=-1; }
  const speedBoost=performance.now()<runSpeedUntil?1.4:1;
  const speed=(running?3.4:1.9)*speedBoost;
  const move=new THREE.Vector3();
  move.addScaledVector(forward,moveZ).addScaledVector(right,moveX);
  if(move.lengthSq()>0){
    move.normalize().multiplyScalar(speed*delta);
    camera.position.add(move);
    distanceAccum+=move.length();
    if(distanceAccum>2.1 && !chaseActive){ distanceAccum=0; SFX.footstep(); }
  }
  camera.position.x=Math.max(-1.3,Math.min(1.3,camera.position.x));
  const minZ=hallwayEndZ+0.6, maxZ=STARTZ+1.3;
  camera.position.z=Math.max(minZ,Math.min(maxZ,camera.position.z));

  // hallway squash/breathe fx
  if(performance.now()<hallwaySquashUntil){
    const s=hallwaySquashDir>0?1.5:0.55;
    hallwayGroup.scale.y=THREE.MathUtils.lerp(hallwayGroup.scale.y,s,0.05);
  }else{
    hallwayGroup.scale.y=THREE.MathUtils.lerp(hallwayGroup.scale.y,1,0.05);
  }
  if(performance.now()<breatheUntil){
    const t=performance.now()*0.004;
    wallMeshes.forEach((w,i)=>{ w.scale.x=1+Math.sin(t+i)*0.06; });
  }

  updateInteractionPrompt();
  updateLookBehind();
  updateChase(delta);
  updateAmbience(delta);

  // reached the end door -> good ending (once level 5 reached, i.e. story complete)
  if(!chaseActive && level>=4 && camera.position.z<hallwayEndZ+2.4){
    endGame("good");
  }
  if(chaseActive && camera.position.z<hallwayEndZ+2.0){
    endGame("good");
  }

  renderer.render(scene,camera);
}
setLights(false);
updateCounterDisplay();
animate();
