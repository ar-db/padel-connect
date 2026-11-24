/* Padel Connect — client application. All privileged operations run through Supabase RPC. */
(() => {
  const cfg = window.PADEL_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const durations = [60, 90];
  const startTimes = [];
  for (let mins=17*60; mins<=22*60; mins+=15) {
    const h=Math.floor(mins/60), m=mins%60;
    startTimes.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  }
  const encodePeriod = (duration,time) => `${duration}_${time}`;
  const decodePeriod = (period) => {
    const match=/^(60|90)_(\d{2}:\d{2})$/.exec(period||"");
    if(!match) return {duration:60,start:"17:00",label:"60 min · 5:00 PM",time:"5:00–6:00 PM"};
    const duration=Number(match[1]), start=match[2], [h,m]=start.split(":").map(Number);
    const end=h*60+m+duration;
    const fmt=n=>{const hh=Math.floor(n/60),mm=n%60,ampm=hh>=12?"PM":"AM",hr=hh%12||12;return `${hr}:${String(mm).padStart(2,"0")} ${ampm}`;};
    return {duration,start,label:`${duration} min · ${fmt(h*60+m)}`,time:`${fmt(h*60+m)}–${fmt(end)}`};
  };
  const timeOptions = startTimes.map(t=>`<option value="${t}">${(()=>{const [h,m]=t.split(":").map(Number);return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`})()}</option>`).join("");
  const state = {client:null,user:null,group:null,member:null,clubs:[],dashboard:null,selected:new Set(),channel:null,best:null};
  let sessionPromise = null;
  const toast = (msg, bad=false) => { const el=$("toast"); el.textContent=msg; el.classList.add("show"); el.style.background=bad?"#8b3d35":"#173b30"; setTimeout(()=>el.classList.remove("show"),3200); };
  const esc = (s) => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const key = (day,period,club) => `${day}|${period}|${club||"any"}`;
  const call = async (fn,args={}) => {
    if (!state.client) throw new Error("Supabase is not initialized. Check config.js and reload the page.");
    await ensureSession();
    const {data,error}=await state.client.rpc(fn,args);
    if(error) throw error;
    return data;
  };
  const setStatus = (s)=>$("connection-label").textContent=s;
  const inviteUrl = () => `${location.origin}${location.pathname}?invite=${encodeURIComponent(state.group.invite_code)}`;
  const showApp = () => { $("setup-panel").classList.add("hidden"); $("app-panel").classList.remove("hidden"); $("leave-group").classList.remove("hidden"); $("group-title").textContent=state.group.name; $("group-code-label").textContent=`INVITE ${state.group.invite_code}`; };
  const showSetup = () => { $("app-panel").classList.add("hidden"); $("setup-panel").classList.remove("hidden"); $("leave-group").classList.add("hidden"); };

  async function ensureSession(){
    if (!state.client) throw new Error("Supabase client is not initialized. Check config.js.");
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const current = await state.client.auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session) {
        state.user = current.data.session.user;
        return current.data.session;
      }
      const signedIn = await state.client.auth.signInAnonymously();
      if (signedIn.error) throw signedIn.error;
      // Confirm the JWT-backed session is available before making any database RPC call.
      let session = signedIn.data.session;
      if (!session) {
        const refreshed = await state.client.auth.getSession();
        if (refreshed.error) throw refreshed.error;
        session = refreshed.data.session;
      }
      if (!session) throw new Error("Supabase did not create an authenticated session. Enable Anonymous Sign-Ins in Supabase Authentication settings, then reload.");
      state.user = session.user;
      return session;
    })();
    try { return await sessionPromise; }
    finally { sessionPromise = null; }
  }
  async function createGroup(name,display){
    const result=await call("create_padel_group",{p_group_name:name,p_display_name:display});
    state.group={id:result.group_id,name:result.group_name,invite_code:result.invite_code}; state.member={id:result.member_id,display_name:display};
    await enterGroup();
  }
  async function joinGroup(code,display){
    const result=await call("join_padel_group",{p_invite_code:code,p_display_name:display});
    state.group={id:result.group_id,name:result.group_name,invite_code:result.invite_code}; state.member={id:result.member_id,display_name:display};
    await enterGroup();
  }
  async function enterGroup(){
    localStorage.setItem("padel_group_id",state.group.id); localStorage.setItem("padel_group_name",state.group.name); localStorage.setItem("padel_group_code",state.group.invite_code);
    showApp(); await refreshDashboard(); subscribe();
  }
  async function refreshDashboard(){
    const data=await call("get_padel_dashboard",{p_group_id:state.group.id});
    state.dashboard=data; state.clubs=data.clubs||[];
    const mine=(data.availability||[]).filter(x=>x.member_id===state.member.id);
    state.selected=new Set(mine.map(x=>key(x.weekday,x.period,x.club_id)));
    renderEditor(); renderDashboard();
  }
  function renderEditor(){
    const container=$("availability-editor");
    const clubOptions=state.clubs;
    const dayOptions=days.map((day,i)=>`<option value="${i}">${day}</option>`).join("");
    const clubOptionsHtml=`<option value="any">Any location</option>${clubOptions.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.area?` · ${esc(c.area)}`:""}</option>`).join("")}`;
    const rows=[...state.selected].map(k=>{
      const [day,period,club]=k.split("|"); const p=decodePeriod(period); const c=clubOptions.find(x=>x.id===club);
      return `<div class="preference-row"><span class="preference-day">${days[Number(day)]}</span><span>${esc(p.label)}</span><span class="preference-location">${c?esc(c.name):"Any location"}</span><button type="button" class="slot-chip selected remove-preference" data-key="${esc(k)}" aria-label="Remove preference">Remove ×</button></div>`;
    }).join("");
    container.innerHTML=`<div class="preference-adder"><select class="availability-select" id="preference-day" aria-label="Day">${dayOptions}</select><select class="availability-select" id="preference-time" aria-label="Start time">${timeOptions}</select><select class="availability-select" id="preference-duration" aria-label="Duration"><option value="60">60 minutes</option><option value="90">90 minutes</option></select><select class="availability-select location-select" id="preference-club" aria-label="Location">${clubOptionsHtml}</select><button type="button" class="add-slot-button" id="add-preference">+ Add preference</button></div><div class="preference-list">${rows||'<span class="empty-slots">No preferences added yet. Add your preferred day, time, duration and location above.</span>'}</div>`;
    $("add-preference").addEventListener("click",()=>{
      const day=Number($("preference-day").value),time=$("preference-time").value,duration=Number($("preference-duration").value),club=$("preference-club").value;
      const preferenceKey=key(day,encodePeriod(duration,time),club==="any"?null:club);
      if(state.selected.has(preferenceKey)){toast("This preference is already added.",true);return;}
      state.selected.add(preferenceKey);
      renderEditor();
    });
    container.querySelectorAll(".remove-preference").forEach(btn=>btn.addEventListener("click",()=>{
      state.selected.delete(btn.dataset.key); renderEditor();
    }));
  }
  function calculateBest(data){
    const counts=new Map(), names=new Map();
    for(const a of data.availability||[]){
      const k=`${a.weekday}|${a.period}|${a.club_id||"any"}`;
      if(!counts.has(k)){counts.set(k,new Set());names.set(k,[]);}
      counts.get(k).add(a.member_id);
    }
    let winner=null;
    for(const [k,set] of counts){
      const [d,p,c]=k.split("|");
      const candidate={weekday:Number(d),period:p,club_id:c==="any"?null:c,count:set.size};
      if(!winner||candidate.count>winner.count) winner=candidate;
    }
    return winner;
  }
  function renderDashboard(){
    const data=state.dashboard||{members:[],availability:[],clubs:[]};
    $("member-count").textContent=`${(data.members||[]).length} players`;
    $("crew-count").textContent=(data.members||[]).length;
    $("crew-list").innerHTML=(data.members||[]).map(m=>`<div class="crew-person"><span class="avatar">${esc(m.display_name.slice(0,2).toUpperCase())}</span><div><strong>${esc(m.display_name)}${m.id===state.member.id?" (you)":""}</strong><small>${(data.availability||[]).filter(a=>a.member_id===m.id).length} selected slots</small></div></div>`).join("")||'<p class="muted">No members yet.</p>';
    state.best=calculateBest(data);
    if(state.best&&state.best.count>0){
      const p=decodePeriod(state.best.period),club=(data.clubs||[]).find(c=>c.id===state.best.club_id);
      $("best-title").textContent=`${days[state.best.weekday]} · ${p.label}`;
      $("best-description").textContent=`${state.best.count} ${state.best.count===1?"player is":"players are"} available${club?` at ${club.name}`:""}. ${p.time}.`;
      $("best-whatsapp").disabled=false;
    }else{
      $("best-title").textContent="Your court is waiting";
      $("best-description").textContent="No availability yet. Be the first to add your slots and invite your crew.";
      $("best-whatsapp").disabled=true;
    }
    $("club-list").innerHTML=(data.clubs||[]).map(c=>`<span class="club-pill">${esc(c.name)}${c.area?`<small>· ${esc(c.area)}</small>`:""}</span>`).join("")||"<span class=\"muted\">No clubs added yet. Add your group’s favourite locations.</span>";
    $("week-label").textContent=`Week of ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`;
  }
  async function saveAvailability(){
    const slots=[...state.selected].map(k=>{const [weekday,period,club]=k.split("|");return {weekday:Number(weekday),period,club_id:club==="any"?null:club};});
    $("save-status").textContent="Saving…";
    try{await call("save_padel_availability",{p_group_id:state.group.id,p_slots:slots});$("save-status").textContent="Saved just now";toast("Your availability is saved.");await refreshDashboard();}
    catch(e){$("save-status").textContent="Could not save";toast(e.message||"Save failed",true);}
  }
  function subscribe(){
    if(state.channel) state.client.removeChannel(state.channel);
    state.channel=state.client.channel(`padel-${state.group.id}`).on("postgres_changes",{event:"*",schema:"public",table:"padel_availability",filter:`group_id=eq.${state.group.id}`},()=>refreshDashboard().catch(console.error)).on("postgres_changes",{event:"*",schema:"public",table:"padel_members",filter:`group_id=eq.${state.group.id}`},()=>refreshDashboard().catch(console.error)).on("postgres_changes",{event:"*",schema:"public",table:"padel_clubs",filter:`group_id=eq.${state.group.id}`},()=>refreshDashboard().catch(console.error)).subscribe();
  }
  function bestMessage(){
    if(!state.best)return "Let's organise a padel game in our group!";
    const p=decodePeriod(state.best.period),club=state.clubs.find(c=>c.id===state.best.club_id);
    return `🎾 Padel plan — ${state.group.name}\n\nBest group slot: ${days[state.best.weekday]}, ${p.label} (${p.time})\nAvailable players: ${state.best.count}${club?`\nPreferred club: ${club.name}${club.area?` (${club.area})`:""}`:""}\n\nCan you make it?`;
  }
  function shareWhatsApp(text){window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");}
  $("year").textContent=new Date().getFullYear();
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));$("join-form").classList.toggle("hidden",t.dataset.tab!=="join");$("create-form").classList.toggle("hidden",t.dataset.tab!=="create");}));
  $("join-form").addEventListener("submit",async e=>{e.preventDefault();try{await joinGroup($("join-code").value.trim(),$("join-name").value.trim());}catch(err){toast(err.message||"Could not join group",true);}});
  $("create-form").addEventListener("submit",async e=>{e.preventDefault();try{await createGroup($("new-group-name").value.trim(),$("create-name").value.trim());}catch(err){toast(err.message||"Could not create group",true);}});
  $("save-availability").addEventListener("click",saveAvailability);
  $("copy-invite").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(`${inviteUrl()}\nInvite code: ${state.group.invite_code}`);toast("Invite link and code copied.");}catch{toast(`Invite code: ${state.group.invite_code}`);}});
  $("share-whatsapp").addEventListener("click",()=>shareWhatsApp(`Join our private Padel Connect group: ${inviteUrl()}\nInvite code: ${state.group.invite_code}`));
  $("best-whatsapp").addEventListener("click",()=>shareWhatsApp(bestMessage()));
  $("club-form").addEventListener("submit",async e=>{e.preventDefault();try{await call("add_padel_club",{p_group_id:state.group.id,p_name:$("club-name").value.trim(),p_area:$("club-area").value.trim()||null});$("club-name").value="";$("club-area").value="";await refreshDashboard();toast("Club added.");}catch(err){toast(err.message||"Could not add club",true);}});
  $("leave-group").addEventListener("click",()=>{if(!confirm("Leave this group on this device? Your submitted availability remains visible to the group."))return;localStorage.removeItem("padel_group_id");localStorage.removeItem("padel_group_name");localStorage.removeItem("padel_group_code");state.group=null;state.member=null;if(state.channel)state.client.removeChannel(state.channel);showSetup();});
  async function init(){
    if(!configured){setStatus("Setup required");toast("Add your Supabase URL and anon key in config.js to connect the app.",true);return;}
    state.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    try{
      setStatus("Signing in…"); await ensureSession();setStatus("Connected");
      const params=new URLSearchParams(location.search),invite=params.get("invite");
      const storedId=localStorage.getItem("padel_group_id");
      if(invite){$("join-code").value=invite;document.querySelector('[data-tab="join"]').click();}
      else if(storedId){
        // Membership is verified by the dashboard RPC; display name is recovered from membership.
        const data=await call("get_my_padel_group",{p_group_id:storedId});
        state.group={id:data.group_id,name:data.group_name,invite_code:data.invite_code};
        state.member={id:data.member_id,display_name:data.display_name};await enterGroup();
      }
    }catch(e){localStorage.removeItem("padel_group_id");showSetup();setStatus("Authentication error");console.error("Padel Connect startup/authentication error:",e);toast(e.message||"Could not sign in. Check Supabase Anonymous Sign-Ins.",true);}
  }
  init();
})();
