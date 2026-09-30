// DCRAMERE — coach ↔ client chat and push-notification helpers (client app + coach dashboard)
(function(){
"use strict";
const DC=window.DC, esc=DC.esc;

// linkify plain URLs, keep everything else escaped
const linkify=t=>esc(t).replace(/https?:\/\/[^\s<]+/g,u=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g,"<br>");
const time=ts=>{const d=new Date(ts*1000),today=new Date();
  return d.toDateString()===today.toDateString()?d.toLocaleTimeString(I18N.locale,{hour:"2-digit",minute:"2-digit"})
    :d.toLocaleDateString(I18N.locale,{day:"numeric",month:"short"})+" "+d.toLocaleTimeString(I18N.locale,{hour:"2-digit",minute:"2-digit"})};

// me: "client" | "coach"; fotoUrl(id) → image URL; checkins: [{id,datum}] to label feedback
function messagesHTML(list,me,fotoUrl,checkins,other){
  if(!list.length) return `<p class="empty chat-empty">${me==="client"?T("Stel hier uw vragen aan uw coach. U krijgt een melding zodra er een antwoord is."):T("Nog geen berichten. Stuur een eerste bericht of reageer op een check-in.")}</p>`;
  let lastDay="";
  return list.map(b=>{
    const day=new Date(b.created_at*1000).toDateString(), sep=day!==lastDay?`<div class="chat-day">${new Date(b.created_at*1000).toLocaleDateString(I18N.locale,{weekday:"long",day:"numeric",month:"long"})}</div>`:"";
    lastDay=day;
    const k=b.checkin_id&&(checkins||[]).find(x=>x.id===b.checkin_id);
    const mine=b.van===me;
    const av=!mine&&other?`<span class="msg-av">${DC.avatarHTML(other.avatar,other.naam,28)}</span>`:"";
    return `${sep}<div class="msg-row ${mine?"mine":"theirs"}">${av}<div class="msg ${mine?"mine":"theirs"}${b.checkin_id?" fb":""}">
      ${b.checkin_id?`<span class="msg-tag">${k?T("Reactie op check-in van {d}",{d:DC.dateNL(k.datum,{day:"numeric",month:"short"})}):T("Reactie op check-in")}</span>`:""}
      ${b.foto?`<a href="${fotoUrl(b.id)}" target="_blank" rel="noopener"><img src="${fotoUrl(b.id)}" alt="${T("Foto")}" loading="lazy"></a>`:""}
      ${b.tekst?`<div class="msg-t" data-no-t>${linkify(b.tekst)}</div>`:""}
      <span class="msg-m">${time(b.created_at)}${mine&&b.gelezen?" · "+T("gelezen"):""}</span></div></div>`;
  }).join("");
}
function composerHTML(){
  return `<form class="composer" data-composer novalidate>
    <label class="composer-foto" title="${T("Foto toevoegen")}"><input type="file" accept="image/*" data-chat-foto hidden><span aria-hidden="true">📷</span><span class="sr">${T("Foto toevoegen")}</span></label>
    <textarea name="tekst" rows="1" placeholder="${T("Typ een bericht")}" aria-label="${T("Bericht")}" maxlength="4000"></textarea>
    <button class="btn small" type="submit">${T("Verstuur")}</button>
  </form><div class="err" data-chat-err role="status"></div>`;
}
function autoGrow(ta){ta.style.height="auto";ta.style.height=Math.min(160,ta.scrollHeight)+"px"}

// ---------- push ----------
const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
function pushSupport(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))
    return isIOS&&!standalone()?"ios-install":"unsupported";
  return "ok";
}
async function pushState(){
  if(pushSupport()!=="ok") return pushSupport();
  if(Notification.permission==="denied") return "denied";
  const reg=await navigator.serviceWorker.getRegistration("/");
  const sub=reg&&await reg.pushManager.getSubscription();
  return sub?"on":"off";
}
const b64ToBytes=s=>{s=s.replace(/-/g,"+").replace(/_/g,"/");const b=atob(s+"===".slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function enablePush(role){
  if(pushSupport()!=="ok") throw new Error(pushSupport()==="ios-install"?T("Zet de app eerst op uw beginscherm (Deel → Zet op beginscherm) en open hem vandaar; daarna kunt u meldingen aanzetten."):T("Deze browser ondersteunt geen pushmeldingen."));
  const {key}=await DC.api("/api/push/key");
  if(!key) throw new Error(T("Meldingen zijn nog niet ingesteld."));
  if(await Notification.requestPermission()!=="granted") throw new Error(T("U heeft meldingen geweigerd. Zet ze aan in de instellingen van uw telefoon of browser."));
  const reg=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
  await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(key)});
  await DC.api("/api/push/subscribe","POST",{endpoint:sub.endpoint,role});
}
async function disablePush(){
  const reg=await navigator.serviceWorker.getRegistration("/");
  const sub=reg&&await reg.pushManager.getSubscription();
  if(sub){await DC.api("/api/push/unsubscribe","POST",{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe()}
}
const PUSH_TEXT={on:T("Meldingen staan aan op dit apparaat."),off:T("Meldingen staan uit op dit apparaat."),denied:T("Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van uw telefoon of browser."),
  "ios-install":T("Op een iPhone werken meldingen alleen als de app op uw beginscherm staat: tik op Deel → Zet op beginscherm en open de app vandaar."),unsupported:T("Deze browser ondersteunt geen pushmeldingen.")};

window.CHAT={messagesHTML,composerHTML,autoGrow,pushState,enablePush,disablePush,PUSH_TEXT};
})();
