/* Padel Connect — client application. All privileged operations run through Supabase RPC. */
(() => {
  const cfg = window.PADEL_CONFIG || {};
  const APP_URL = "https://ar-db.github.io/padel-connect/";
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const $ = (id) => document.getElementById(id);
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const durations = [60, 90];
  const startTimes = [];
  for (let mins=17*60; mins<=22*60; mins+=30) {
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
  const state = {client:null,user:null,group:null,member:null,clubs:[],dashboard:null,selected:new Set(),channel:null,best:null,matches:[],pendingEmail:"",linkingAnonymous:false};
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
      if (!current.data.session) throw new Error("Please verify your email before continuing.");
      state.user = current.data.session.user;
      return current.data.session;
    })();
    try { return await sessionPromise; }
    finally { sessionPromise = null; }
  }
  function showAuth(message, linking=false){
    $("auth-panel").classList.remove("hidden");
    $("setup-panel").classList.add("hidden");
    $("app-panel").classList.add("hidden");
    $("leave-group").classList.add("hidden");
    $("auth-heading").innerHTML=linking?"Keep your existing<br><span>player identity.</span>":"Sign in with<br><span>your email.</span>";
    $("auth-description").textContent=message || (linking?"Verify an email to secure this existing account. Your groups, saved preferences and admin rights will stay connected.":"Enter your email and we’ll send you a one-time verification code. No password required.");
    $("email-form").classList.remove("hidden");
    $("otp-form").classList.add("hidden");
  }
  async function routeAfterAuth(){
    $("auth-panel").classList.add("hidden");
    setStatus("Connected");
    const params=new URLSearchParams(location.search),invite=params.get("invite");
    const storedId=localStorage.getItem("padel_group_id");
    $("my-groups-panel").classList.add("hidden");$("my-groups-panel").innerHTML="";
    if(invite){$("join-code").value=invite;showSetup();document.querySelector('[data-tab="join"]').click();return;}
    if(storedId){
      try{
        const data=await call("get_my_padel_group",{p_group_id:storedId});
        state.group={id:data.group_id,name:data.group_name,invite_code:data.invite_code};
        state.member={id:data.member_id,display_name:data.display_name,is_admin:!!data.is_admin};
        await enterGroup();return;
      }catch(e){
        localStorage.removeItem("padel_group_id");localStorage.removeItem("padel_group_name");localStorage.removeItem("padel_group_code");
      }
    }
    showSetup();
    try{
      const groups=await call("get_my_padel_groups");
      if(groups.length===1){
        const g=groups[0];state.group={id:g.group_id,name:g.group_name,invite_code:g.invite_code};state.member={id:g.member_id,display_name:g.display_name,is_admin:!!g.is_admin};await enterGroup();return;
      }
      if(groups.length>1){
        const panel=$("my-groups-panel");panel.classList.remove("hidden");
        panel.innerHTML=`<div class="panel-kicker">YOUR GROUPS</div><div class="my-groups-list">${groups.map((g,i)=>`<button type="button" class="my-group-button" data-index="${i}"><strong>${esc(g.group_name)}</strong><span>${g.is_admin?"Admin":"Member"} · Open group →</span></button>`).join("")}</div>`;
        panel.querySelectorAll(".my-group-button").forEach(btn=>btn.addEventListener("click",async()=>{
          const g=groups[Number(btn.dataset.index)];state.group={id:g.group_id,name:g.group_name,invite_code:g.invite_code};state.member={id:g.member_id,display_name:g.display_name,is_admin:!!g.is_admin};await enterGroup();
        }));
      }
    }catch(e){console.error("Could not load memberships:",e);toast("Could not load your groups. Run the email-auth SQL migration in Supabase.",true);}
  }
  async function sendEmailCode(){
    const email=$("auth-email").value.trim().toLowerCase();
    if(!email) throw new Error("Enter your email address.");
    const {data:{session},error:sessionError}=await state.client.auth.getSession();
    if(sessionError) throw sessionError;
    state.pendingEmail=email;
    state.linkingAnonymous=!!(session && session.user && session.user.is_anonymous);
    if(state.linkingAnonymous){
      // Link the email to the current anonymous Supabase user so existing group memberships/admin rights keep the same UID.
      const {error}=await state.client.auth.updateUser({email});
      if(error) throw error;
    }else{
      const {error}=await state.client.auth.signInWithOtp({
        email,
        options:{
          shouldCreateUser:true,
          emailRedirectTo:APP_URL
        }
      });
      if(error) throw error;
    }
    $("email-form").classList.add("hidden");
    $("otp-form").classList.remove("hidden");
    $("auth-description").textContent=`We sent a verification code to ${email}. Enter it below to continue.`;
    toast("Verification code sent. Check your inbox.");
  }
  async function verifyEmailCode(){
    const token=$("auth-otp").value.trim();
    if(!state.pendingEmail) throw new Error("Enter your email and request a new code first.");
    const type=state.linkingAnonymous?"email_change":"email";
    const {data,error}=await state.client.auth.verifyOtp({email:state.pendingEmail,token,type});
    if(error) throw error;
    if(!data.session) throw new Error("Email verified, but no sign-in session was returned. Please sign in again.");
    state.user=data.user||data.session.user;
    state.pendingEmail="";state.linkingAnonymous=false;
    toast("Email verified successfully.");
    await routeAfterAuth();
  }
  async function createGroup(name,display){
    const result=await call("create_padel_group",{p_group_name:name,p_display_name:display});
    state.group={id:result.group_id,name:result.group_name,invite_code:result.invite_code}; state.member={id:result.member_id,display_name:display,is_admin:true};
    await enterGroup();
  }
  async function joinGroup(code,display){
    const result=await call("join_padel_group",{p_invite_code:code,p_display_name:display});
    state.group={id:result.group_id,name:result.group_name,invite_code:result.invite_code};
    const me=await call("get_my_padel_group",{p_group_id:result.group_id});
    state.member={id:result.member_id,display_name:display,is_admin:!!me.is_admin};
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
  function calculateMatches(data){
    const counts=new Map();
    for(const a of data.availability||[]){
      const k=`${a.weekday}|${a.period}|${a.club_id||"any"}`;
      if(!counts.has(k)) counts.set(k,new Set());
      counts.get(k).add(a.member_id);
    }
    const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const todayMondayIndex=(today.getDay()+6)%7;
    const matches=[];
    for(const [k,set] of counts){
      if(set.size<4) continue;
      const [d,p,c]=k.split("|");
      const weekday=Number(d), decoded=decodePeriod(p);
      let daysAhead=(weekday-todayMondayIndex+7)%7;
      const [hour,minute]=decoded.start.split(":").map(Number);
      if(daysAhead===0 && hour*60+minute<=now.getHours()*60+now.getMinutes()) daysAhead=7;
      const date=new Date(today); date.setDate(today.getDate()+daysAhead);
      const clubId=c==="any"?null:c;
      matches.push({weekday,period:p,club_id:clubId,count:set.size,date,dateLabel:date.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})});
    }
    return matches.sort((a,b)=>a.date-b.date || a.period.localeCompare(b.period));
  }
  function calculateBest(data){
    const counts=new Map();
    for(const a of data.availability||[]){
      const k=`${a.weekday}|${a.period}|${a.club_id||"any"}`;
      if(!counts.has(k)) counts.set(k,new Set());
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
    $("crew-list").innerHTML=(data.members||[]).map(m=>{
      const isMe=m.id===state.member.id;
      const slotCount=(data.availability||[]).filter(a=>a.member_id===m.id).length;
      const adminTag=isMe&&state.member.is_admin?'<span class="admin-tag">ADMIN</span>':"";
      const removeButton=state.member.is_admin&&!isMe?`<button type="button" class="remove-member-button" data-member-id="${esc(m.id)}" data-member-name="${esc(m.display_name)}">Remove</button>`:"";
      return `<div class="crew-person"><span class="avatar">${esc(m.display_name.slice(0,2).toUpperCase())}</span><div class="crew-person-info"><strong>${esc(m.display_name)}${isMe?" (you)":""} ${adminTag}</strong><small>${slotCount} selected slots</small></div>${removeButton}</div>`;
    }).join("")||'<p class="muted">No members yet.</p>';
    if(state.member.is_admin){
      const note=document.createElement("p"); note.className="admin-note"; note.textContent="Group admin: you can remove duplicate or unwanted members. Their saved availability will also be deleted.";
      $("crew-list").prepend(note);
      $("crew-list").querySelectorAll(".remove-member-button").forEach(btn=>btn.addEventListener("click",async()=>{
        const memberName=btn.dataset.memberName;
        if(!confirm(`Remove ${memberName} from this group? Their saved availability will also be deleted.`)) return;
        btn.disabled=true;
        try{await call("remove_padel_group_member",{p_group_id:state.group.id,p_member_id:btn.dataset.memberId});toast(`${memberName} removed from the group.`);await refreshDashboard();}
        catch(e){btn.disabled=false;toast(e.message||"Could not remove member",true);}
      }));
    }
    state.best=calculateBest(data);
    state.matches=calculateMatches(data);
    const kicker=$("best-kicker"), picks=$("group-picks-list");
    if(state.matches.length){
      if(kicker) kicker.textContent="THE GROUP UNLOCK";
      $("best-title").textContent="Upcoming group matches";
      $("best-description").textContent=`${state.matches.length} upcoming ${state.matches.length===1?"session has":"sessions have"} at least 4 players with the same day, time, duration and location.`;
      picks.innerHTML=state.matches.map((match,i)=>{
        const p=decodePeriod(match.period),club=(data.clubs||[]).find(c=>c.id===match.club_id);
        return `<div class="group-pick-row"><div class="group-pick-main"><strong>${esc(match.dateLabel)}</strong><span>${esc(p.label)} · ${esc(p.time)}</span><small>${club?esc(club.name):"Any location"} · ${match.count} players</small></div><button type="button" class="pick-share-button" data-match="${i}" aria-label="Share ${esc(match.dateLabel)} match on WhatsApp">Share ↗</button></div>`;
      }).join("");
      $("best-whatsapp").classList.add("hidden");
      picks.querySelectorAll(".pick-share-button").forEach(btn=>btn.addEventListener("click",()=>shareWhatsApp(matchMessage(state.matches[Number(btn.dataset.match)]))));
    }else{
      picks.innerHTML="";
      const matched=state.best?state.best.count:0;
      const needed=4-matched;
      if(kicker) kicker.textContent="BUILDING YOUR GROUP";
      $("best-title").textContent=matched===0?"4 players needed":`${needed} more ${needed===1?"player":"players"} to go`;
      if(matched>0){
        const p=decodePeriod(state.best.period),club=(data.clubs||[]).find(c=>c.id===state.best.club_id);
        $("best-description").textContent=`${matched} ${matched===1?"player":"players"} currently match ${days[state.best.weekday]} at ${p.label}${club?` at ${club.name}`:" (Any location)"}. Need ${needed} more ${needed===1?"player":"players"} to unlock the Group Pick.`;
      }else{
        $("best-description").textContent="No matching preferences yet. Add your day, time, duration and location. Upcoming Group Picks appear when 4 players match.";
      }
      $("best-whatsapp").classList.add("hidden");
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
  function matchMessage(match){
    if(!match) return "Join our Padel Connect group to find a match.";
    const p=decodePeriod(match.period),club=state.clubs.find(c=>c.id===match.club_id);
    return `🎾 Padel match — ${state.group.name}\n\n${match.dateLabel}\n${p.label} (${p.time})\nPlayers matched: ${match.count}${club?`\nLocation: ${club.name}${club.area?` (${club.area})`:""}`:"\nLocation: Any location"}\n\nCan you make it?`;
  }
  function bestMessage(){
    if(!state.matches.length)return "We need at least 4 players with the same day, time, duration and location to confirm a Group Pick.";
    return `🎾 Upcoming Padel matches — ${state.group.name}\n\n${state.matches.map(m=>{const p=decodePeriod(m.period),club=state.clubs.find(c=>c.id===m.club_id);return `${m.dateLabel} · ${p.label} (${p.time}) · ${m.count} players · ${club?club.name:"Any location"}`;}).join("\n")}\n\nWhich match can you join?`;
  }
  function shareWhatsApp(text){window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");}
  $("year").textContent=new Date().getFullYear();
  $("email-form").addEventListener("submit",async e=>{e.preventDefault();const btn=$("send-code-button");btn.disabled=true;try{await sendEmailCode();}catch(err){toast(err.message||"Could not send verification code",true);}finally{btn.disabled=false;}});
  $("otp-form").addEventListener("submit",async e=>{e.preventDefault();try{await verifyEmailCode();}catch(err){toast(err.message||"Could not verify code",true);}});
  $("resend-code").addEventListener("click",async()=>{try{await sendEmailCode();}catch(err){toast(err.message||"Could not resend code",true);}});
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
    if(!configured){setStatus("Setup required");showAuth("Add your Supabase URL and anon key in config.js to connect the app.");toast("Add your Supabase URL and anon key in config.js to connect the app.",true);return;}
    state.client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    try{
      setStatus("Checking session…");
      const {data,error}=await state.client.auth.getSession();
      if(error) throw error;
      const session=data.session;
      if(session && session.user && session.user.is_anonymous){
        setStatus("Secure your account");
        showAuth("You’re using an older temporary player identity. Verify an email now to keep your existing groups, availability and group-admin permissions.",true);
        return;
      }
      if(session){state.user=session.user;await routeAfterAuth();}
      else{setStatus("Email verification required");showAuth();}
    }catch(e){
      showAuth();setStatus("Authentication error");console.error("Padel Connect startup/authentication error:",e);toast(e.message||"Could not initialize authentication.",true);
    }
  }
  init();
})();
