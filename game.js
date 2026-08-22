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

// A real handheld flashlight - a spotlight cone attached to the camera,
// toggled with F. Always available from the start, no unlock needed.
const flashlight=new THREE.SpotLight(0xe8f0d8,0,9,Math.PI/7,0.4,1.4);
flashlight.position.set(0,0,0.15);
const flashlightTarget=new THREE.Object3D();
flashlightTarget.position.set(0,0,-1);
camera.add(flashlight,flashlightTarget);
flashlight.target=flashlightTarget;
scene.add(camera);
let flashlightOn=false;
let flashlightBoostUntil=0;
let flashlightDisabledUntil=0;
function setFlashlight(on){
  flashlightOn=on;
  flashlight.intensity=on?(performance.now()<flashlightBoostUntil?2.6:1.6):0;
  document.getElementById("flashlight-hint")?.classList.toggle("on",on);
}
function toggleFlashlight(){
  if(performance.now()<flashlightDisabledUntil) return;
  setFlashlight(!flashlightOn);
  SFX.flashlightClick();
}

let lightsOn=false;
const ceilingLights=[]; // {light, baseIntensity}

function setLights(on){
  lightsOn=on;
  ambient.intensity=on?0.16:0.02;
  ceilingLights.forEach(l=>{
    l.light.intensity=on?l.baseIntensity:0;
    if(l.diffuser) l.diffuser.material.emissiveIntensity=on?0.6:0.02;
  });
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
// Fine per-pixel grain, applied under hand-drawn detail so nothing reads as a flat color.
function addGrain(ctx,w,h,amount){
  const id=ctx.getImageData(0,0,w,h);
  for(let i=0;i<id.data.length;i+=4){
    const n=(Math.random()-0.5)*amount;
    id.data[i]+=n; id.data[i+1]+=n; id.data[i+2]+=n;
  }
  ctx.putImageData(id,0,0);
}

const floorTex=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle="#0c0c0a"; ctx.fillRect(0,0,w,h);
  addGrain(ctx,w,h,14);
  ctx.strokeStyle="rgba(28,28,22,.9)"; ctx.lineWidth=2;
  for(let i=0;i<=4;i++){ ctx.beginPath(); ctx.moveTo(i*w/4,0); ctx.lineTo(i*w/4,h); ctx.stroke(); }
  // scuffed wear streaks and dark stains
  for(let i=0;i<10;i++){
    ctx.globalAlpha=.08+Math.random()*.1;
    ctx.fillStyle=Math.random()<0.5?"#000":"#2a2a20";
    const rw=10+Math.random()*40, rh=4+Math.random()*10;
    ctx.fillRect(Math.random()*w,Math.random()*h,rw,rh);
  }
  ctx.globalAlpha=1;
},256,256);
floorTex.repeat.set(1,1);

const wallTex=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle="#171712"; ctx.fillRect(0,0,w,h);
  addGrain(ctx,w,h,16);
  // vertical grime streaks, like old water damage
  for(let i=0;i<7;i++){
    const x=Math.random()*w;
    const grad=ctx.createLinearGradient(x,0,x,h);
    grad.addColorStop(0,"rgba(0,0,0,0)");
    grad.addColorStop(1,`rgba(0,0,0,${0.25+Math.random()*.3})`);
    ctx.fillStyle=grad;
    ctx.fillRect(x-8,0,16,h);
  }
  // baseboard scuff line
  ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillRect(0,h-14,w,14);
},256,256);
wallTex.repeat.set(1,1.4);

const ceilingTex=canvasTexture((ctx,w,h)=>{
  ctx.fillStyle="#0a0a09"; ctx.fillRect(0,0,w,h);
  addGrain(ctx,w,h,10);
  ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=3;
  for(let i=1;i<3;i++){ ctx.beginPath(); ctx.moveTo(0,i*h/3); ctx.lineTo(w,i*h/3); ctx.stroke(); }
  // faint water-stain rings
  for(let i=0;i<4;i++){
    ctx.strokeStyle=`rgba(40,35,25,${0.15+Math.random()*.15})`;
    ctx.lineWidth=3+Math.random()*4;
    ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,10+Math.random()*22,0,Math.PI*2); ctx.stroke();
  }
},256,256);

const wallMatNormal=new THREE.MeshStandardMaterial({color:0xffffff,map:wallTex,roughness:0.92,metalness:0.03});
const wallMatDistorted=new THREE.MeshStandardMaterial({color:0x2b1414,roughness:0.9,emissive:0x330000,emissiveIntensity:0.15});
const floorMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.85,metalness:0.05,map:floorTex});
const ceilingMat=new THREE.MeshStandardMaterial({color:0xffffff,map:ceilingTex,roughness:1});

// ---- Buttons (main, story-beat, and secret) -----------------------------
// Declared before the hallway is built because room contents (below)
// reposition some of these into their rooms as they're constructed.
function makeButtonMesh(color){
  const g=new THREE.Group();
  // recessed metal mounting plate with a beveled inset panel
  const backplate=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.045),
    new THREE.MeshStandardMaterial({color:0x2a2a28,roughness:0.4,metalness:0.75}));
  const inset=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.02),
    new THREE.MeshStandardMaterial({color:0x151513,roughness:0.6,metalness:0.5}));
  inset.position.z=0.025;
  // chrome bezel ring around the button
  const bezel=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.018,10,20),
    new THREE.MeshStandardMaterial({color:0x8a8a86,roughness:0.25,metalness:0.9}));
  bezel.position.z=0.05;
  // short stem the cap sits on
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.1,0.05,16),
    new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(0.5),roughness:0.5,metalness:0.2}));
  stem.rotation.x=Math.PI/2; stem.position.z=0.06;
  // rounded mushroom cap - a hemisphere, the classic industrial push-button shape
  const cap=new THREE.Mesh(
    new THREE.SphereGeometry(0.11,20,12,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshStandardMaterial({color,roughness:0.3,metalness:0.15,emissive:color,emissiveIntensity:0.35})
  );
  cap.rotation.x=-Math.PI/2; cap.position.z=0.085;
  // four bolt heads in the corners of the backplate, for detail
  const boltMat=new THREE.MeshStandardMaterial({color:0x1c1c1a,roughness:0.4,metalness:0.7});
  [[-0.17,-0.17],[0.17,-0.17],[-0.17,0.17],[0.17,0.17]].forEach(([bx,by])=>{
    const bolt=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.02,8),boltMat);
    bolt.rotation.x=Math.PI/2; bolt.position.set(bx,by,0.03);
    g.add(bolt);
  });
  g.add(backplate,inset,bezel,stem,cap);
  g.userData.cap=cap;
  g.userData.capRestZ=cap.position.z;
  return g;
}
function animateButtonPress(buttonGroup){
  const cap=buttonGroup.userData.cap;
  if(!cap) return;
  cap.position.z=buttonGroup.userData.capRestZ-0.045;
  clearTimeout(buttonGroup.userData._pressTimer);
  buttonGroup.userData._pressTimer=setTimeout(()=>{ cap.position.z=buttonGroup.userData.capRestZ; },130);
}
const mainButton=makeButtonMesh(0xc81e2b);
function placeMainButtonAt(z,side){
  mainButton.position.set(side*(3/2-0.03),1.3,z);
  mainButton.rotation.y=side>0?-Math.PI/2:Math.PI/2;
}
placeMainButtonAt(-6,1);
scene.add(mainButton);
function relocateMainButton(){
  const z=hallwayEndZ+ (Math.random()*(camera.position.z-hallwayEndZ-4))-2;
  placeMainButtonAt(Math.min(z,-4),Math.random()<0.5?-1:1);
}

const secondButton=makeButtonMesh(0x2b7ac8); secondButton.visible=false; scene.add(secondButton);
const dontPressButton=makeButtonMesh(0xd4b106); dontPressButton.visible=false; scene.add(dontPressButton);

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

// ---- Hallway ------------------------------------------------------------
const CORR_W=3, CORR_H=2.8, SEG_LEN=4;
const ROOM_DOOR_W=1.3, ROOM_DOOR_H=2.05, ROOM_DEPTH=3.4, ROOM_WIDTH=3.2;
const hallwayGroup=new THREE.Group();
scene.add(hallwayGroup);
const wallMeshes=[]; // for distortion / breathing fx
const decorativeDoors=[]; // closed set-dressing doors, pivot groups
const roomDoors=[];        // real, walkable doors into explorable rooms
let mirrorRoomInfo=null;
let segCount=0;
let hallwayEndZ=0; // most-negative Z built so far

// Rooms branching off the corridor - z must land on a segment center (multiple of SEG_LEN).
const ROOMS_CONFIG=[
  {z:-16,side:1,kind:"note"},
  {z:-28,side:-1,kind:"supply"},
  {z:-44,side:1,kind:"mirror"},
];
function roomAt(z,side){ return ROOMS_CONFIG.find(r=>r.z===z && r.side===side); }

// A door panel with hinge at local (x=0,z=0), extending toward +local Z.
// Has raised paneling and a knob so it actually reads as a door, not a slab.
function makeDoorPanel(width,height,thickness,color){
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color,roughness:0.6,metalness:0.12});
  const panel=new THREE.Mesh(new THREE.BoxGeometry(thickness,height,width),mat);
  panel.position.set(0,0,width/2);
  const insetMat=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(0.72),roughness:0.7});
  const inset1=new THREE.Mesh(new THREE.BoxGeometry(thickness*1.6,height*0.34,width*0.6),insetMat);
  inset1.position.set(0,height*0.19,width/2);
  const inset2=inset1.clone(); inset2.position.y=-height*0.26;
  const knobMat=new THREE.MeshStandardMaterial({color:0xb0b0a2,roughness:0.28,metalness:0.85});
  const knob=new THREE.Mesh(new THREE.SphereGeometry(0.032,10,10),knobMat);
  knob.position.set(thickness/2+0.035,0,width-0.12);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.14,0.05),knobMat);
  plate.position.set(thickness/2+0.005,0,width-0.12);
  g.add(panel,inset1,inset2,knob,plate);
  return g;
}

// Closed, atmospheric door set flush into a solid wall - swings on a real
// hinge for the "a door opens" effects instead of rotating through itself.
function buildDecorativeDoor(parentGroup,z,side){
  const width=0.85,height=1.95,thickness=0.05;
  const wallX=side*(CORR_W/2-0.005);
  const hingeZ=z-width/2;
  const jambMat=new THREE.MeshStandardMaterial({color:0x2f2416,roughness:0.55,metalness:0.15});
  const frame=new THREE.Mesh(new THREE.BoxGeometry(0.05,height+0.14,width+0.14),jambMat);
  frame.position.set(wallX-side*0.03,height/2+0.02,z);
  parentGroup.add(frame);
  const pivot=new THREE.Group();
  pivot.position.set(wallX,height/2+0.02,hingeZ);
  pivot.add(makeDoorPanel(width,height,thickness,0x241a12));
  pivot.userData.side=side;
  parentGroup.add(pivot);
  decorativeDoors.push(pivot);
}
function openRandomDecorativeDoor(){
  if(decorativeDoors.length===0) return;
  const pivot=decorativeDoors[Math.floor(Math.random()*decorativeDoors.length)];
  const side=pivot.userData.side||1;
  pivot.rotation.y=side>0?-1.2:1.2;
  SFX.doorOpen();
  clearTimeout(pivot.userData._closeTimer);
  pivot.userData._closeTimer=setTimeout(()=>{ pivot.rotation.y=0; SFX.doorClose(); },3500);
}

// A real, walkable door into a small room. Opens/closes on interact.
function toggleRoomDoor(d){
  d.isOpen=!d.isOpen;
  d.targetAngle=d.isOpen?d.openAngle:0;
  d.isOpen?SFX.doorOpen():SFX.doorClose();
}
function openRandomRealDoor(){
  const closed=roomDoors.filter(d=>!d.isOpen);
  if(closed.length===0) return;
  toggleRoomDoor(closed[Math.floor(Math.random()*closed.length)]);
}

function buildRoomEntrance(parentGroup,z,side,room){
  const wallX=side*(CORR_W/2);
  const stubWidth=(SEG_LEN-ROOM_DOOR_W)/2;
  [-1,1].forEach(dir=>{
    const stub=new THREE.Mesh(new THREE.BoxGeometry(0.2,CORR_H,stubWidth),wallMatNormal);
    stub.position.set(wallX,CORR_H/2,z+dir*(ROOM_DOOR_W/2+stubWidth/2));
    parentGroup.add(stub); wallMeshes.push(stub);
  });
  const lintel=new THREE.Mesh(new THREE.BoxGeometry(0.2,CORR_H-ROOM_DOOR_H,ROOM_DOOR_W+0.1),wallMatNormal);
  lintel.position.set(wallX,ROOM_DOOR_H+(CORR_H-ROOM_DOOR_H)/2,z);
  parentGroup.add(lintel); wallMeshes.push(lintel);

  const jambMat=new THREE.MeshStandardMaterial({color:0x2f2416,roughness:0.5,metalness:0.15});
  [-1,1].forEach(dir=>{
    const jamb=new THREE.Mesh(new THREE.BoxGeometry(0.09,ROOM_DOOR_H,0.09),jambMat);
    jamb.position.set(wallX-side*0.045,ROOM_DOOR_H/2,z+dir*(ROOM_DOOR_W/2));
    parentGroup.add(jamb);
  });
  const topJamb=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,ROOM_DOOR_W+0.18),jambMat);
  topJamb.position.set(wallX-side*0.045,ROOM_DOOR_H,z);
  parentGroup.add(topJamb);

  const hingeZ=z-ROOM_DOOR_W/2;
  const pivot=new THREE.Group();
  pivot.position.set(wallX,ROOM_DOOR_H/2,hingeZ);
  pivot.add(makeDoorPanel(ROOM_DOOR_W,ROOM_DOOR_H,0.06,0x2a1c10));
  parentGroup.add(pivot);
  roomDoors.push({
    pivot,isOpen:false,targetAngle:0,openAngle:side>0?-1.85:1.85,
    pos:new THREE.Vector3(wallX,1.2,z)
  });

  const roomGroup=new THREE.Group();
  const rx=side*(CORR_W/2+ROOM_DEPTH/2);
  const rFloor=new THREE.Mesh(new THREE.BoxGeometry(ROOM_DEPTH,0.2,ROOM_WIDTH),floorMat);
  rFloor.position.set(rx,-0.1,z); roomGroup.add(rFloor);
  const rCeil=new THREE.Mesh(new THREE.BoxGeometry(ROOM_DEPTH,0.2,ROOM_WIDTH),ceilingMat);
  rCeil.position.set(rx,CORR_H,z); roomGroup.add(rCeil);
  const rBack=new THREE.Mesh(new THREE.BoxGeometry(0.2,CORR_H,ROOM_WIDTH),wallMatNormal);
  rBack.position.set(side*(CORR_W/2+ROOM_DEPTH),CORR_H/2,z); roomGroup.add(rBack); wallMeshes.push(rBack);
  [-1,1].forEach(dir=>{
    const sw=new THREE.Mesh(new THREE.BoxGeometry(ROOM_DEPTH,CORR_H,0.2),wallMatNormal);
    sw.position.set(rx,CORR_H/2,z+dir*(ROOM_WIDTH/2));
    roomGroup.add(sw); wallMeshes.push(sw);
  });
  const rLight=new THREE.PointLight(0xd9e8c9,0.55,6);
  rLight.position.set(rx,CORR_H-0.3,z);
  roomGroup.add(rLight);
  ceilingLights.push({light:rLight,baseIntensity:0.55});

  buildRoomContents(roomGroup,rx,z,side,room.kind);
  parentGroup.add(roomGroup);
}

function buildRoomContents(group,rx,z,side,kind){
  if(kind==="note"){
    const deskMat=new THREE.MeshStandardMaterial({color:0x2a1c10,roughness:0.7});
    const desk=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.75,0.6),deskMat);
    desk.position.set(rx,0.375,z); group.add(desk);
    const chair=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.45,0.4),deskMat);
    chair.position.set(rx,0.225,z+0.55); group.add(chair);
    const noteTex=canvasTexture((ctx,w,h)=>{
      ctx.fillStyle="#e8e2c8"; ctx.fillRect(0,0,w,h);
      ctx.fillStyle="#1a1a1a"; ctx.font="10px monospace";
      ["SUBJECT LOG - CORRIDOR 7","","DO NOT PRESS BUTTON","TWELVE MORE THAN ONCE.","","IF THE COUNTER STOPS,","STOP ALSO.","","- M."]
        .forEach((l,i)=>ctx.fillText(l,8,18+i*13));
    },128,160);
    const note=new THREE.Mesh(new THREE.PlaneGeometry(0.32,0.4),new THREE.MeshStandardMaterial({map:noteTex}));
    note.rotation.x=-Math.PI/2+0.15;
    note.position.set(rx,0.77,z-0.05);
    group.add(note);
  }else if(kind==="supply"){
    const shelfMat=new THREE.MeshStandardMaterial({color:0x333028,roughness:0.8,metalness:0.1});
    for(let i=0;i<3;i++){
      const shelf=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.05,1.6),shelfMat);
      shelf.position.set(rx+side*(ROOM_DEPTH/2-0.25),0.4+i*0.55,z);
      group.add(shelf);
    }
    secretButtonFloor.position.set(rx-side*0.4,-0.02,z);
    secretButtonFloor.rotation.set(-Math.PI/2,0,0);
  }else if(kind==="mirror"){
    const mirrorTex=canvasTexture((ctx,w,h)=>{
      const grad=ctx.createLinearGradient(0,0,w,h);
      grad.addColorStop(0,"#3a4a48"); grad.addColorStop(1,"#0e1614");
      ctx.fillStyle=grad; ctx.fillRect(0,0,w,h);
    },64,96);
    const mirror=new THREE.Mesh(new THREE.PlaneGeometry(0.7,1.5),
      new THREE.MeshStandardMaterial({map:mirrorTex,roughness:0.15,metalness:0.6}));
    mirror.rotation.y=side>0?-Math.PI/2:Math.PI/2;
    mirror.position.set(side*(CORR_W/2+ROOM_DEPTH-0.08),1.35,z);
    group.add(mirror);
    const frameMesh=new THREE.Mesh(new THREE.BoxGeometry(0.04,1.6,0.8),
      new THREE.MeshStandardMaterial({color:0x1c1a14,roughness:0.6}));
    frameMesh.rotation.y=mirror.rotation.y;
    frameMesh.position.copy(mirror.position); frameMesh.position.x-=side*0.02;
    group.add(frameMesh);
    mirrorRoomInfo={x:rx,z,side};
  }
}

function buildSegment(z){
  const g=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.BoxGeometry(CORR_W,0.2,SEG_LEN),floorMat);
  floor.position.set(0,-0.1,z); g.add(floor);
  const ceil=new THREE.Mesh(new THREE.BoxGeometry(CORR_W,0.2,SEG_LEN),ceilingMat);
  ceil.position.set(0,CORR_H,z); g.add(ceil);
  [-1,1].forEach(side=>{
    const room=roomAt(z,side);
    if(room){
      buildRoomEntrance(g,z,side,room);
    }else{
      const wall=new THREE.Mesh(new THREE.BoxGeometry(0.2,CORR_H,SEG_LEN),wallMatNormal);
      wall.position.set(side*(CORR_W/2),CORR_H/2,z);
      g.add(wall); wallMeshes.push(wall);
    }
  });
  // ceiling light fixture - a real housing + diffuser, not just an invisible point light
  if(segCount%2===0){
    const housing=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.08,0.35),
      new THREE.MeshStandardMaterial({color:0x2a2a26,roughness:0.5,metalness:0.4}));
    housing.position.set(0,CORR_H-0.05,z);
    g.add(housing);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(0.82,0.02,0.28),
      new THREE.MeshStandardMaterial({color:0xe8f0d8,emissive:0xd9e8c9,emissiveIntensity:0.6,transparent:true,opacity:0.85}));
    diffuser.position.set(0,CORR_H-0.1,z);
    g.add(diffuser);
    const pl=new THREE.PointLight(0xd9e8c9,0.85,6.5);
    pl.position.set(0,CORR_H-0.25,z);
    g.add(pl);
    ceilingLights.push({light:pl,baseIntensity:0.85,diffuser});
  }
  if(!roomAt(z,-1) && !roomAt(z,1) && segCount%5===3){
    buildDecorativeDoor(g,z,Math.random()<0.5?-1:1);
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

// ---- Duck / prop helpers --------------------------------------
function spawnDuck(x,z){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),new THREE.MeshStandardMaterial({color:0xd4b106}));
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,8),new THREE.MeshStandardMaterial({color:0xd4b106}));
  head.position.set(0,0.18,0.1);
  g.add(body,head); g.position.set(x,0.15,z);
  scene.add(g);
  return g;
}

// ---- Monster --------------------------------------------------------------
const monster=(function(){
  const g=new THREE.Group();
  // Very faint self-illumination - just enough that a flashlight or nearby
  // light reveals an actual silhouette, so the eyes read as a face, not two
  // dots floating in nothing.
  const mat=new THREE.MeshStandardMaterial({color:0x0a0808,roughness:0.95,metalness:0,emissive:0x0d0605,emissiveIntensity:0.15});
  const eyeMat=new THREE.MeshBasicMaterial({color:0xff1a1a});

  // Tall, unnaturally thin and slightly hunched - proportions that don't quite read as human.
  const torso=new THREE.Mesh(new THREE.BoxGeometry(0.3,1.75,0.2),mat);
  torso.position.y=1.2; torso.rotation.x=0.09;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.14,10,10),mat);
  head.scale.set(0.85,1.15,0.9);
  head.position.set(0,2.18,0.06);
  const eyeL=new THREE.Mesh(new THREE.SphereGeometry(0.016,6,6),eyeMat); eyeL.position.set(-0.045,2.2,0.16);
  const eyeR=eyeL.clone(); eyeR.position.x=0.045;
  // a tiny, very short-range light so the head/shoulders catch a faint rim
  // without lighting up the corridor - this is what stops the eyes from
  // reading as disembodied dots floating in pure black.
  const selfLight=new THREE.PointLight(0x662222,0.22,1.4,2);
  selfLight.position.set(0,2.1,0.1);
  const armL=new THREE.Mesh(new THREE.BoxGeometry(0.065,1.55,0.065),mat);
  armL.position.set(-0.26,1.05,0.05); armL.rotation.z=0.1; armL.rotation.x=0.06;
  const armR=armL.clone(); armR.position.x=0.26; armR.rotation.z=-0.1;
  const legL=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.9,0.11),mat); legL.position.set(-0.1,0.45,0);
  const legR=legL.clone(); legR.position.x=0.1;

  g.add(torso,head,eyeL,eyeR,selfLight,armL,armR,legL,legR);
  g.userData.eyes=[eyeL,eyeR];
  g.userData.legL=legL; g.userData.legR=legR;
  g.visible=false;
  scene.add(g);
  return g;
})();

let monsterLastSeenZ=null;
// Reveals the monster with a quick "lurch into being" grow-in rather than
// popping in at full size - the fix for it reading as a teleport.
function showMonsterAt(x,z){
  monster.position.set(x,0,z);
  monster.scale.setScalar(0.001);
  monster.userData.manifestStart=performance.now();
  monster.visible=true;
  monsterLastSeenZ=z;
}
function hideMonster(){ monster.visible=false; }
function monsterPeek(x,z,duration){
  showMonsterAt(x,z);
  setTimeout(hideMonster,duration||220);
}
// Ambient "it's stalking you" advance - each call moves it a fraction of the
// remaining distance closer to wherever it last appeared, instead of
// teleporting to a fresh random spot every time.
function monsterAdvanceToward(){
  const playerZ=camera.position.z;
  let targetZ;
  if(monsterLastSeenZ===null) targetZ=playerZ-11-Math.random()*4;
  else targetZ=Math.min(monsterLastSeenZ+(playerZ-monsterLastSeenZ)*0.35, playerZ-2.6);
  showMonsterAt(camera.position.x+(Math.random()-0.5)*1.4,targetZ);
  SFX.monsterFootstep();
  setTimeout(hideMonster,500+Math.random()*400);
}
// Subtle wrongness while it's visible - never fully still, never fully readable.
function updateMonsterIdle(){
  if(!monster.visible) return;
  const manifestT=Math.min(1,(performance.now()-(monster.userData.manifestStart||0))/220);
  monster.scale.setScalar(Math.max(0.001,1-Math.pow(1-manifestT,3)));
  const t=performance.now()*0.001;
  monster.rotation.y=Math.sin(t*0.7)*0.05+(Math.random()-0.5)*0.01;
  monster.position.y=Math.sin(t*3.1)*0.01;
  if(chaseActive){
    const swing=Math.sin(t*7)*0.35;
    monster.userData.legL.rotation.x=swing; monster.userData.legR.rotation.x=-swing;
  }
  const eyeFlicker=Math.random()<0.02?0:1;
  monster.userData.eyes.forEach(e=>e.visible=eyeFlicker>0||Math.random()>0.05);
}
function updateMirrorRoom(delta){
  if(!mirrorRoomInfo || chaseActive) return;
  const inRoom=Math.abs(camera.position.z-mirrorRoomInfo.z)<ROOM_WIDTH/2-0.3
    && Math.sign(camera.position.x)===mirrorRoomInfo.side && Math.abs(camera.position.x)>CORR_W/2+0.3;
  if(inRoom && !monster.visible && Math.random()<0.002+proximity*delta*0.6){
    showMonsterAt(mirrorRoomInfo.x-mirrorRoomInfo.side*0.2, mirrorRoomInfo.z);
    SFX.monsterGrowl();
    setTimeout(hideMonster,280);
  }
}

// ---- Camera shake & jumpscare flash ---------------------------------
let shakeUntil=0, shakeMag=0;
function cameraShake(mag,durationMs){ shakeMag=mag; shakeUntil=performance.now()+durationMs; }
function jumpscareFlash(){
  const el=document.getElementById("jumpscare-flash");
  el.style.transition="none";
  el.style.opacity="0.85";
  requestAnimationFrame(()=>{
    el.style.transition="opacity .4s ease-out";
    el.style.opacity="0";
  });
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

// ---- Stamina ----------------------------------------------------------
let stamina=100;
let canSprint=true;
const STAMINA_DRAIN=26;    // per second while sprinting
const STAMINA_REGEN=15;    // per second while not sprinting
const STAMINA_REENABLE=22; // must regen back above this before sprint re-enables after hitting 0
const staminaFillEl=document.getElementById("stamina-bar-fill");
const staminaWrapEl=document.getElementById("stamina-bar-wrap");
function updateStaminaBar(isSprinting){
  if(!staminaFillEl) return;
  staminaFillEl.style.width=stamina+"%";
  staminaFillEl.classList.toggle("low",stamina<30);
  staminaFillEl.classList.toggle("depleted",!canSprint);
  staminaWrapEl.classList.toggle("active",isSprinting||stamina<100);
}

addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(e.code==="ShiftLeft"||e.code==="ShiftRight") running=true;
  if(e.code==="Space"){ e.preventDefault(); tryInteract(); }
  if(e.code==="Escape"){ togglePause(); }
  if(e.code==="KeyF"){ toggleFlashlight(); }
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
    {mesh:secretButtonFloor,range:1.2,visible:true,label:"[ SPACE ] THIS SEEMS UNWISE",onPress:pressFloorButton},
    {mesh:secretButtonDark,range:1.6,visible:!lightsOn,label:"[ SPACE ] PRESS IT",onPress:pressDarkButton},
    {mesh:secretButtonBackward,range:1.6,visible:secretButtonBackward.visible,label:"[ SPACE ] PRESS IT",onPress:pressBackwardButton},
    {mesh:secretButtonBehind,range:1.6,visible:secretButtonBehind.visible,label:"[ SPACE ] YOU FOUND IT.",onPress:pressBehindButton},
  ];
  roomDoors.forEach(d=>{
    list.push({mesh:{position:d.pos},range:2.3,visible:true,
      label:d.isOpen?"[ SPACE ] CLOSE DOOR":"[ SPACE ] OPEN DOOR",
      onPress:()=>toggleRoomDoor(d)});
  });
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
  ()=>{ openRandomDecorativeDoor(); showCaption("A door opens somewhere nearby."); },
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
    animateButtonPress(mainButton);
    updateCounterDisplay();
    if(stuckPresses===3) showCaption("STOP.",{warn:true,duration:1600});
    if(stuckPresses>=4){ counterStuckAt=0; stuckPresses=0; updateCounterDisplay(); }
    return;
  }
  pressCount++;
  SFX.buttonClick();
  animateButtonPress(mainButton);
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
  animateButtonPress(secondButton);
  const pool=[
    ()=>showCaption("That did something. Probably."),
    ()=>{ spawnDuck(camera.position.x,camera.position.z-3); showCaption("Another duck."); },
    ()=>{ SFX.stinger(); showCaption("...",{warn:true}); bumpProximity(0.04); },
  ];
  pool[Math.floor(Math.random()*pool.length)]();
}
function pressDontPressButton(){
  SFX.stinger();
  animateButtonPress(dontPressButton);
  jumpscareFlash();
  cameraShake(0.06,500);
  showMonsterAt(camera.position.x, camera.position.z-1.6);
  setTimeout(hideMonster,260);
  bumpProximity(0.35);
  showCaption("YOU WERE WARNED.",{warn:true,duration:2600});
}

function pressFloorButton(){
  SFX.stinger();
  animateButtonPress(secretButtonFloor);
  jumpscareFlash();
  cameraShake(0.08,700);
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
  animateButtonPress(secretButtonDark);
  setLights(true);
  flashlightBoostUntil=performance.now()+15000;
  setFlashlight(true);
  showCaption("You feel a little safer.");
}
function pressBackwardButton(){
  SFX.buttonClick();
  animateButtonPress(secretButtonBackward);
  reverseUntil=performance.now()+9000;
  showCaption("The controls feel wrong now.",{warn:true});
}
function pressBehindButton(){
  SFX.stinger();
  animateButtonPress(secretButtonBehind);
  jumpscareFlash();
  cameraShake(0.1,800);
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

let safeUntil=0;
const GREEN=[
  ()=>{ flashlightBoostUntil=performance.now()+14000; setFlashlight(true); showCaption("Your flashlight feels brighter."); },
  ()=>{ openRandomRealDoor(); showCaption("The next door swings open."); },
  ()=>{ hideMonster(); proximity=Math.max(0,proximity-0.25); showCaption("It feels further away now."); },
  ()=>{ runSpeedUntil=performance.now()+8000; showCaption("You feel faster."); },
  ()=>{ setLights(true); showCaption("The lights come back on."); },
  ()=>{ stamina=100; showCaption("You catch your breath."); },
  ()=>{ safeUntil=performance.now()+6000; proximity=Math.max(0,proximity-0.3); showCaption("For a moment, you feel completely safe."); },
];
const YELLOW=[
  ()=>{ for(let i=0;i<3;i++) spawnDuck(camera.position.x+(Math.random()-0.5)*2,camera.position.z-2-Math.random()*4);
        showCaption("Random objects appear."); },
  ()=>{ reverseUntil=performance.now()+8000; showCaption("Your controls just reversed.",{warn:true}); },
  ()=>{ resizeHallway(-1); },
  ()=>{ resizeHallway(1); },
  ()=>{ SFX.stopDrone(); SFX.startDrone(); showCaption("The music changed."); },
  ()=>{ makeWallsBreathe(); },
  ()=>{ const oldFov=camera.fov; camera.fov=95; camera.updateProjectionMatrix();
        showCaption("Your vision warps."); setTimeout(()=>{ camera.fov=baseFov; camera.updateProjectionMatrix(); },6000); },
  ()=>{ const oldSens=mouseSensitivity; mouseSensitivity*=1.7;
        showCaption("Your head feels heavy."); setTimeout(()=>{ mouseSensitivity=oldSens; },7000); },
  ()=>{ const fake=Math.floor(Math.random()*9000)+1000; counterEl.textContent=fake;
        showCaption("The counter shows a number that isn't real."); setTimeout(updateCounterDisplay,700); },
];
const RED=[
  ()=>{ showMonsterAt(camera.position.x,camera.position.z-6); jumpscareFlash(); cameraShake(0.05,400); setTimeout(hideMonster,900); SFX.stinger(); bumpProximity(0.18); showCaption("Something is here with you.",{warn:true}); },
  ()=>{ setLights(false); showCaption("The lights go out.",{warn:true}); },
  ()=>{ showCaption("You hear the doors lock.",{warn:true}); bumpProximity(0.05); },
  ()=>{ extendHallway(6); placeFinalDoor(); showCaption("The hallway just got longer.",{warn:true}); },
  ()=>{ SFX.footstep(); SFX.footstep(); showCaption("Footsteps. Not yours.",{warn:true}); bumpProximity(0.1); },
  ()=>{ monsterAdvanceToward(); showCaption("It's getting closer.",{warn:true}); },
  ()=>{ flashlightDisabledUntil=performance.now()+10000; setFlashlight(false); showCaption("Your flashlight just died.",{warn:true}); },
  ()=>{ SFX.monsterGrowl(); bumpProximity(0.15); showCaption("You hear something breathing.",{warn:true}); },
  ()=>{ cameraShake(0.035,700); showCaption("The floor shudders.",{warn:true}); },
];
const PURPLE=[
  ()=>{ SFX.staticBurst(0.5); showCaption("A random explosion happens. You are fine."); },
  ()=>{ SFX.stopDrone(); showCaption("Elevator music plays for a moment."); setTimeout(()=>SFX.startDrone(),4000); },
  ()=>{ showCaption("The hallway briefly looks like a supermarket."); },
  ()=>{ showCaption("You now have a banana."); },
  ()=>{ SFX.voiceBlip(); showCaption("Your character's voice changed."); },
  ()=>{ showCaption('"bruh"'); },
  ()=>{ showCaption("The button did absolutely nothing."); },
  ()=>{ SFX.doorClose(); showCaption("A door slams shut somewhere. For no reason."); },
  ()=>{ showCaption("You could've sworn the button just winked at you."); },
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
  jumpscareFlash();
  cameraShake(0.12,900);
  showCaption("BOOM.",{warn:true,duration:1400});
  setTimeout(()=>{
    showMonsterAt(camera.position.x, camera.position.z-8);
    SFX.monsterGrowl();
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
  chaseStepAccum=(chaseStepAccum||0)+delta;
  if(chaseStepAccum>0.42){ chaseStepAccum=0; SFX.monsterFootstep(); }
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
  let shakeYaw=0, shakePitch=0;
  if(performance.now()<shakeUntil){
    shakeYaw=(Math.random()-0.5)*shakeMag;
    shakePitch=(Math.random()-0.5)*shakeMag;
  }
  camera.rotation.y=yaw+shakeYaw; camera.rotation.x=pitch+shakePitch;

  // movement
  const forward=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,yaw,0));
  const right=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(0,yaw,0));
  let moveZ=0, moveX=0;
  if(keys["KeyW"]||keys["ArrowUp"]) moveZ+=1;
  if(keys["KeyS"]||keys["ArrowDown"]) moveZ-=1;
  if(keys["KeyD"]) moveX+=1;
  if(keys["KeyA"]) moveX-=1;
  const isMovingInput=moveZ!==0||moveX!==0;
  const reversed=performance.now()<reverseUntil;
  if(reversed){ moveZ*=-1; moveX*=-1; }

  const wantsSprint=running && canSprint && isMovingInput;
  if(wantsSprint){
    stamina=Math.max(0,stamina-STAMINA_DRAIN*delta);
    if(stamina<=0) canSprint=false;
  }else{
    stamina=Math.min(100,stamina+STAMINA_REGEN*delta);
    if(!canSprint && stamina>=STAMINA_REENABLE) canSprint=true;
  }
  updateStaminaBar(wantsSprint);

  const speedBoost=performance.now()<runSpeedUntil?1.4:1;
  const speed=(wantsSprint?3.4:1.9)*speedBoost;
  const move=new THREE.Vector3();
  move.addScaledVector(forward,moveZ).addScaledVector(right,moveX);
  if(move.lengthSq()>0){
    move.normalize().multiplyScalar(speed*delta);
    camera.position.add(move);
    distanceAccum+=move.length();
    const footstepGap=wantsSprint?1.5:2.1;
    if(distanceAccum>footstepGap && !chaseActive){ distanceAccum=0; SFX.footstep(); }
  }
  let xMin=-1.3, xMax=1.3;
  roomDoors.forEach(d=>{
    if(d.isOpen && Math.abs(camera.position.z-d.pos.z)<ROOM_WIDTH/2-0.15){
      if(d.pos.x>0) xMax=Math.max(xMax,CORR_W/2+ROOM_DEPTH-0.35);
      else xMin=Math.min(xMin,-(CORR_W/2+ROOM_DEPTH-0.35));
    }
  });
  camera.position.x=Math.max(xMin,Math.min(xMax,camera.position.x));
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
  roomDoors.forEach(d=>{ d.pivot.rotation.y=THREE.MathUtils.lerp(d.pivot.rotation.y,d.targetAngle,0.08); });

  updateInteractionPrompt();
  updateLookBehind();
  updateChase(delta);
  updateAmbience(delta);
  updateMonsterIdle();
  updateMirrorRoom(delta);

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
updateStaminaBar(false);
animate();

