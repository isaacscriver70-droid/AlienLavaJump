// Records which ending the player just reached (for the title-screen tracker).
function markEndingSeen(name){
  let seen=[];
  try{ seen=JSON.parse(localStorage.getItem("dlby_endings")||"[]"); }catch(e){ seen=[]; }
  if(!seen.includes(name)) seen.push(name);
  try{ localStorage.setItem("dlby_endings",JSON.stringify(seen)); }catch(e){}
}
