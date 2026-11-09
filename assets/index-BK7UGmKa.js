(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&n(i)}).observe(document,{childList:!0,subtree:!0});function a(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=a(s);fetch(s.href,r)}})();const de=new Worker(new URL("/MacroTracker/assets/db.worker-msuTcJ56.js",import.meta.url),{type:"module"});let Ae=0;const Z=new Map;de.onmessage=e=>{const{id:t,result:a,error:n}=e.data,s=Z.get(t);s&&(Z.delete(t),n?s.ko(new Error(n)):s.ok(a))};const Re=new Set(["ajouter","ajouterManuel","supprimer","creerRepas","supprimerRepas","copier","definirPoids","definirMarque","reinitialiser"]),me=[];function W(e){me.push(e)}function m(e,t){const a=++Ae;return new Promise((n,s)=>{Z.set(a,{ok:r=>{Re.has(e)&&me.forEach(i=>i()),n(r)},ko:s}),de.postMessage({id:a,op:e,payload:t})})}async function Ce(){const e=await fetch("/MacroTracker/ingredients.json",{cache:"no-cache"});if(!e.ok)throw new Error(`ingredients.json introuvable (${e.status})`);return m("init",await e.json())}const Me="1030203211932-umkg61dsdvfkp1gaq7a4cuajfmoqaj6r.apps.googleusercontent.com",xe="https://www.googleapis.com/auth/drive.file",fe="macrotracker.sqlite",Ie=2500,L="macrotracker.drive.connecte",x="macrotracker.drive.fileId",I="macrotracker.drive.lastSyncedModifiedTime",F="macrotracker.drive.pendingChangeAt";let q=null,A=null,C=null,Q=!1,V=null,E=null,N=!1;const ge=[];let he=null;function Fe(e){ge.push(e)}function Ne(e){he=e}function j(){ge.forEach(e=>e())}function Pe(){return{disponible:!0,connecte:localStorage.getItem(L)==="1",enAttente:localStorage.getItem(F)!==null,dernierSyncLe:localStorage.getItem(I),erreur:E,reconnexionRequise:N}}function Oe(){return A||(A=new Promise((e,t)=>{const a=document.createElement("script");a.src="https://accounts.google.com/gsi/client",a.async=!0,a.onload=()=>e(),a.onerror=()=>{A=null,t(new Error("Google Identity Services bloqué (bloqueur de pub / navigation privée ?)"))},document.head.appendChild(a)}),A)}async function ye(){return await Oe(),C||(C=window.google.accounts.oauth2.initTokenClient({client_id:Me,scope:xe,callback:()=>{}})),C}const Je={popup_failed_to_open:"La fenêtre Google ne s'est pas ouverte : autorise les pop-ups pour ce site.",popup_closed:"Connexion Google annulée."};function be(e){return new Promise((t,a)=>{const n=s=>{s.callback=r=>r.error?a(new Error(r.error)):t(r),s.error_callback=r=>a(new Error(Je[r?.type]??r?.message??r?.type??"Échec de l'authentification Google")),s.requestAccessToken({prompt:e})};C?n(C):ye().then(n,a)})}async function Ge(){if(q&&q.expireLe-Date.now()>6e4)return q.valeur;try{const e=await be("none");return q={valeur:e.access_token,expireLe:Date.now()+e.expires_in*1e3},N=!1,q.valeur}catch(e){throw N=!0,e}}class G extends Error{constructor(t,a){super(a),this.statut=t}}async function P(e,t={}){const a=await Ge(),n=await fetch(e,{...t,headers:{...t.headers,Authorization:`Bearer ${a}`}});if(!n.ok){const s=await n.text();let r=s.slice(0,200);try{r=JSON.parse(s)?.error?.message??r}catch{}throw new G(n.status,`Drive ${n.status} — ${r}`)}return n}async function Ue(){const e=encodeURIComponent(`name='${fe}' and trashed=false`),t=await P(`https://www.googleapis.com/drive/v3/files?q=${e}&fields=files(id)&spaces=drive`),{files:a}=await t.json();return a?.[0]?.id??null}async function He(e){const t="macrotracker-"+Math.random().toString(36).slice(2),a=new Blob([`--${t}\r
Content-Type: application/json; charset=UTF-8\r
\r
`+JSON.stringify({name:fe,mimeType:"application/vnd.sqlite3"})+`\r
`,`--${t}\r
Content-Type: application/vnd.sqlite3\r
\r
`,e,`\r
--${t}--`]);return(await P("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime",{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${t}`},body:a})).json()}async function Be(e,t){return(await P(`https://www.googleapis.com/upload/drive/v3/files/${e}?uploadType=media&fields=modifiedTime`,{method:"PATCH",headers:{"Content-Type":"application/vnd.sqlite3"},body:t})).json()}async function Ke(e){return(await(await P(`https://www.googleapis.com/drive/v3/files/${e}?fields=modifiedTime`)).json()).modifiedTime}async function Ye(e){const t=await P(`https://www.googleapis.com/drive/v3/files/${e}?alt=media`);return new Uint8Array(await t.arrayBuffer())}function D(e,t){return t.catch(a=>{const n=`${e} : ${a?.message??a}`;throw a instanceof G?new G(a.statut,n):new Error(n)})}const ve=e=>e instanceof G&&e.statut===404;function we(){localStorage.removeItem(x),localStorage.removeItem(I)}async function ce(e){try{return await D("lecture de la date Drive",Ke(e))}catch(t){if(!ve(t))throw t;return we(),null}}async function ze(){E=null;try{const e=await be("");q={valeur:e.access_token,expireLe:Date.now()+e.expires_in*1e3},N=!1,localStorage.setItem(L,"1"),j(),await $e()}catch(e){E=e?.message??String(e),j()}}function We(){try{window.google?.accounts?.oauth2?.revoke(q?.valeur??"",()=>{})}catch{}q=null,E=null,N=!1,localStorage.removeItem(L),j()}function Qe(){localStorage.getItem(L)==="1"&&(localStorage.setItem(F,new Date().toISOString()),j(),V&&clearTimeout(V),V=setTimeout(ee,Ie))}async function ee(){if(!(Q||localStorage.getItem(L)!=="1")){Q=!0;try{const e=await D("export local",m("exporter")),t=localStorage.getItem(x);let a=null;if(t)try{a=await D("envoi",Be(t,e))}catch(n){if(!ve(n))throw n;we()}if(!a){const n=await D("création du fichier",He(e));localStorage.setItem(x,n.id),a=n}localStorage.setItem(I,a.modifiedTime),localStorage.removeItem(F),E=null}catch(e){E=e?.message??String(e)}finally{Q=!1,j()}}}async function $e(){let e=localStorage.getItem(x),t=e?await ce(e):null;if(t||(e=await D("recherche du fichier",Ue()),e&&(localStorage.setItem(x,e),t=await ce(e))),!e||!t){await ee();return}const a=localStorage.getItem(F),n=a??localStorage.getItem(I);if(!n||new Date(t).getTime()>new Date(n).getTime()){const s=await D("téléchargement",Ye(e));await D("import local",Promise.resolve(he?.(s))),localStorage.setItem(I,t),localStorage.removeItem(F)}else(a||new Date(n).getTime()>new Date(t).getTime())&&await ee();E=null,j()}function Ve(){ye().catch(()=>{})}async function Xe(){if(localStorage.getItem(L)==="1")try{await $e()}catch(e){E=e?.message??String(e),j()}}const M=[{cle:"proteines",nom:"Protéines",kcalParG:4},{cle:"glucides",nom:"Glucides",kcalParG:4},{cle:"lipides",nom:"Lipides",kcalParG:9}],te=document.getElementById("app"),v=e=>e.toLocaleDateString("sv-SE"),h=e=>Math.round(e).toString(),g=e=>String(e).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),_e=e=>e.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/œ/g,"oe").replace(/æ/g,"ae"),Se=e=>new Date(e+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}),Ze=e=>{const t=Math.round((Date.now()-new Date(e).getTime())/6e4);return t<1?"à l'instant":t<60?`il y a ${t} min`:`il y a ${Math.round(t/60)} h`},et=e=>e.reconnexionRequise?"reconnexion nécessaire":e.erreur?e.erreur:e.enAttente?"en attente…":e.dernierSyncLe?`synchronisé ${Ze(e.dernierSyncLe)}`:"connecté",ae=matchMedia("(prefers-reduced-motion: reduce)").matches;let f=v(new Date),ne=[],ke=new Map,ie=[],U=[],O=null,J=!1,y=null,S=f.slice(0,7),qe=new Map,T={kcal:0,arcs:[0,0,0]},b=!0;async function w(){const e=await m("jour",{jour:f});ie=e.lignes,U=e.repas,O=e.poids,J=e.marque,z()}async function Ee(e){await m("importer",{octets:e}),De(await m("ingredients")),T={kcal:0,arcs:[0,0,0]},b=!0,await w()}function De(e){ne=e,ke=new Map(e.map(t=>[t.id,_e(`${t.nom} ${t.categorie}`)]))}function R(e){return ie.reduce((t,a)=>t+a[e],0)}function $(e){const t=document.createElement("template");return t.innerHTML=e.trim(),t.content.firstElementChild}function k(e){y=e,z()}function tt(e,t,a){if(ae||t===a){e.textContent=h(a);return}const n=performance.now(),s=550,r=i=>{const c=Math.min(1,(i-n)/s),l=1-Math.pow(1-c,3);e.textContent=h(t+(a-t)*l),c<1&&requestAnimationFrame(r)};requestAnimationFrame(r)}const re=54,le=2*Math.PI*re,ue=5;function at(){const e=R("kcal"),t=M.map(o=>R(o.cle)*o.kcalParG),a=t.reduce((o,u)=>o+u,0),n=a?t.map(o=>o/a*le):[0,0,0];let s=0;const r=n.map(o=>{const u=s;return s+=o,u}),i=$(`
    <section class="jour ${a?"":"jour--vide"}">
      <div class="couronne">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle class="arc arc--fond" cx="64" cy="64" r="${re}"></circle>
          ${M.map((o,u)=>`
            <circle class="arc arc--${o.cle}" cx="64" cy="64" r="${re}"
                    data-arc="${u}" data-depart="${r[u]}"></circle>`).join("")}
        </svg>
        <div class="couronne__centre">
          <span class="chiffre chiffre--grand" data-kcal>0</span>
          <span class="unite">kcal</span>
        </div>
      </div>

      <ul class="repartition">
        ${M.map((o,u)=>`
          <li>
            <span class="pastille pastille--${o.cle}"></span>
            <span class="repartition__nom">${o.nom}</span>
            <span class="repartition__g chiffre">${h(R(o.cle))} g</span>
            <span class="repartition__pc chiffre">${a?h(t[u]/a*100)+" %":"—"}</span>
          </li>`).join("")}
        ${R("fibres")>0?`
          <li class="repartition--discret">
            <span class="pastille pastille--fibres"></span>
            <span class="repartition__nom">Fibres</span>
            <span class="repartition__g chiffre">${h(R("fibres"))} g</span>
            <span class="repartition__pc"></span>
          </li>`:""}
      </ul>
    </section>`),c=[...i.querySelectorAll("[data-arc]")],l=o=>{let u=0;c.forEach((d,p)=>{const _=Math.max(0,o[p]-ue);d.style.strokeDasharray=`${_} ${le-_}`,d.style.strokeDashoffset=`${-(u+ue/2)}`,u+=o[p]})};return l(ae?n:T.arcs),ae||requestAnimationFrame(()=>requestAnimationFrame(()=>l(n))),tt(i.querySelector("[data-kcal]"),T.kcal,e),T={kcal:e,arcs:n},i}function nt(e,t){const a=e.id===null?[]:ie.filter(r=>r.repas_id===e.id),n=a.reduce((r,i)=>r+i.kcal,0),s=$(`
    <section class="repas ${b?"repas--entre":""}" style="--rang:${t}">
      <header class="repas__tete">
        <h2>Repas ${t+1}</h2>
        ${a.length?`<span class="repas__kcal chiffre">${h(n)} kcal</span>`:""}
        ${e.id===null?"":`<button class="repas__suppr" data-suppr aria-label="Supprimer le repas ${t+1}">×</button>`}
      </header>
      <ul class="lignes">
        ${a.map((r,i)=>`
          <li class="ligne" style="--rang:${i}">
            <button class="ligne__nom" data-detail aria-expanded="false">
              ${g(r.nom)}<span class="ligne__fleche" aria-hidden="true">⌄</span>
            </button>
            <span class="ligne__g chiffre">${r.grammes?`${h(r.grammes)} g`:"✎"}</span>
            <span class="ligne__kcal chiffre">${h(r.kcal)}</span>
            <button class="retirer" data-id="${r.id}" aria-label="Retirer ${g(r.nom)}">×</button>
            <ul class="ligne__macros">
              <li><span class="pastille pastille--proteines"></span>Protéines <span class="chiffre">${r.proteines.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--glucides"></span>Glucides <span class="chiffre">${r.glucides.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--lipides"></span>Lipides <span class="chiffre">${r.lipides.toFixed(1)} g</span></li>
              <li><span class="pastille pastille--fibres"></span>Fibres <span class="chiffre">${r.fibres.toFixed(1)} g</span></li>
            </ul>
          </li>`).join("")}
      </ul>
      <button class="ajouter">+ Ajouter un aliment</button>
    </section>`);return s.querySelectorAll(".retirer").forEach(r=>{r.onclick=async()=>{b=!1,await m("supprimer",{id:Number(r.dataset.id)}),w()}}),s.querySelectorAll("[data-detail]").forEach(r=>{r.onclick=()=>{const i=r.closest(".ligne").classList.toggle("ligne--ouverte");r.setAttribute("aria-expanded",String(i))}}),s.querySelector(".ajouter").onclick=()=>k({type:"recherche",repas:e.id}),s.querySelector("[data-suppr]")?.addEventListener("click",async()=>{a.length&&!confirm(`Supprimer le repas ${t+1} et ses ${a.length} aliment(s) ?`)||(b=!1,await m("supprimerRepas",{id:e.id}),w())}),s}function Y(e,t){const a=$(`
    <div class="voile">
      <div class="feuille" role="dialog" aria-modal="true" aria-label="${g(t)}">${e}</div>
    </div>`);return a.onclick=n=>{n.target===a&&k(null)},a.querySelector("[data-fermer]")?.addEventListener("click",()=>k(null)),a}function rt(e){const t=Y(`
    <header class="feuille__tete">
      <h2>Choisir un aliment</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <input class="recherche" type="search" placeholder="Filtrer…" autocomplete="off" spellcheck="false">
    <ul class="resultats"></ul>`,"Ajouter un aliment"),a=t.querySelector(".recherche"),n=t.querySelector(".resultats");let s=[];const r=()=>{const l=_e(a.value.trim());s=ne.filter(d=>!l||ke.get(d.id).includes(l)).slice(0,50);let o="";const u=a.value.trim();n.innerHTML=(s.length?s.map(d=>`${d.categorie===o?"":`<li class="categorie">${g(o=d.categorie)}</li>`}<li><button data-id="${g(d.id)}">
            <span>${g(d.nom)}</span>
            <span class="apercu chiffre">${h(d.kcal)} kcal · ${d.proteines.toFixed(1)} P</span>
          </button></li>`).join(""):'<li class="vide">Rien ne correspond.</li>')+`<li class="creer"><button data-creer>+ Aliment libre${u?` « ${g(u)} »`:""}</button></li>`,n.querySelectorAll("button[data-id]").forEach(d=>{d.onclick=()=>i(ne.find(p=>p.id===d.dataset.id))}),n.querySelector("[data-creer]").onclick=c},i=l=>k({type:"quantite",repas:e,ing:l}),c=()=>k({type:"libre",repas:e,nom:a.value.trim()});return a.oninput=r,a.onkeydown=l=>{l.key==="Enter"&&(s.length?i(s[0]):c())},r(),setTimeout(()=>a.focus(),30),t}function st(e,t){const a=JSON.parse(t.portions_json||"[]"),n=t.unite&&t.unite_g?{label:t.unite,g:t.unite_g}:null,s=p=>n.label+(p>1?"s":""),r=Y(`
    <header class="feuille__tete">
      <button data-retour aria-label="Revenir à la liste">‹</button>
      <h2>${g(t.nom)}</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    ${t.note?`<p class="note">${g(t.note)}</p>`:""}
    ${n?`<p class="note">Estimation : 1 ${g(n.label)} ≈ ${h(n.g)} g</p>`:""}
    <div class="pese">
      <input class="quantite" type="number" inputmode="decimal" value="${n?1:100}" min="0" step="1">
      <span class="unite">${n?g(n.label):"g"}</span>
    </div>
    ${a.length&&!n?`<div class="portions">${a.map(p=>`<button class="portion" data-g="${p.g}">${g(p.label)} · ${h(p.g)} g</button>`).join("")}</div>`:""}
    <div class="calcul"></div>
    <button class="valider">Ajouter au repas</button>`,`Peser ${t.nom}`),i=r.querySelector(".quantite"),c=r.querySelector(".unite"),l=r.querySelector(".calcul"),o=()=>(parseFloat(i.value)||0)*(n?n.g:1),u=()=>{n&&(c.textContent=s(parseFloat(i.value)||0));const p=o()/100;l.innerHTML=M.map(_=>`<span><span class="pastille pastille--${_.cle}"></span>${(t[_.cle]*p).toFixed(1)} g</span>`).join("")+`<strong class="chiffre">${h(t.kcal*p)} kcal</strong>`},d=async()=>{const p=o();p>0&&(y=null,b=!1,await m("ajouter",{jour:f,repas_id:e,ing:t,grammes:p}),w())};return i.oninput=u,i.onkeydown=p=>{p.key==="Enter"&&d()},u(),setTimeout(()=>{i.focus(),i.select()},30),r.querySelectorAll(".portion").forEach(p=>{p.onclick=()=>{i.value=p.dataset.g,u(),i.focus()}}),r.querySelector(".valider").onclick=d,r.querySelector("[data-retour]").onclick=()=>k({type:"recherche",repas:e}),r}function it(e,t){const a=Y(`
    <header class="feuille__tete">
      <button data-retour aria-label="Revenir à la liste">‹</button>
      <h2>Aliment libre</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="manuel">
      <input class="manuel__nom" type="text" placeholder="Nom de l'aliment" autocomplete="off"
             value="${g(t)}">
      <label class="manuel__champ"><span>Kcal</span>
        <input type="number" inputmode="decimal" min="0" step="1" data-kcal></label>
      <label class="manuel__champ"><span>Protéines (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-proteines></label>
      <label class="manuel__champ"><span>Glucides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-glucides></label>
      <label class="manuel__champ"><span>Lipides (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-lipides></label>
      <label class="manuel__champ"><span>Fibres (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.1" data-fibres></label>
    </div>
    <div class="calcul"></div>
    <button class="valider">Ajouter au repas</button>`,"Aliment libre"),n=a.querySelector(".manuel__nom"),s=a.querySelector(".calcul"),r=o=>a.querySelector(`[data-${o}]`),i=o=>parseFloat(r(o).value)||0,c=()=>{s.innerHTML=M.map(o=>`<span><span class="pastille pastille--${o.cle}"></span>${i(o.cle).toFixed(1)} g</span>`).join("")+`<strong class="chiffre">${h(i("kcal"))} kcal</strong>`},l=async()=>{const o=n.value.trim(),u=parseFloat(r("kcal").value);!o||!(u>=0)||(y=null,b=!1,await m("ajouterManuel",{jour:f,repas_id:e,nom:o,kcal:u,proteines:i("proteines"),glucides:i("glucides"),lipides:i("lipides"),fibres:i("fibres")}),w())};return a.querySelectorAll("input").forEach(o=>{o.oninput=c,o.onkeydown=u=>{u.key==="Enter"&&l()}}),c(),setTimeout(()=>{n.focus(),n.select()},30),a.querySelector(".valider").onclick=l,a.querySelector("[data-retour]").onclick=()=>k({type:"recherche",repas:e}),a}function ot(){const e=Y(`
    <header class="feuille__tete">
      <h2>Recopier un repas</h2>
      <button data-fermer aria-label="Fermer">×</button>
    </header>
    <div class="reglages">
      <label class="reglage">
        <span>Depuis le jour</span>
        <span class="reglage__saisie"><input type="date" data-depuis value="${f}" max="${f}"></span>
      </label>
    </div>
    <ul class="resultats" data-liste></ul>`,"Recopier un repas"),t=e.querySelector("[data-depuis]"),a=e.querySelector("[data-liste]"),n=async()=>{const r=(await m("apercuJour",{jour:t.value})).filter(i=>i.n>0);a.innerHTML=r.length?r.map((i,c)=>`<li><button data-id="${i.id}">
            <span>Repas ${c+1}<br><small class="apercu">${g(i.apercu??"")}</small></span>
            <span class="apercu chiffre">${h(i.kcal)} kcal</span>
          </button></li>`).join(""):`<li class="vide">Aucun repas le ${g(Se(t.value))}.</li>`,a.querySelectorAll("button").forEach(i=>{i.onclick=async()=>{y=null,b=!1,await m("copier",{repas_id:Number(i.dataset.id),vers:f}),w()}})};return t.onchange=n,n(),e}function ct(){if(!y)return null;switch(y.type){case"recherche":return rt(y.repas);case"quantite":return st(y.repas,y.ing);case"libre":return it(y.repas,y.nom);case"copier":return ot()}}function oe(e){e!==f&&(f=e,f.slice(0,7)!==S&&(S=f.slice(0,7),B()),T={kcal:0,arcs:[0,0,0]},b=!0,w())}function H(e){const t=new Date(f+"T12:00:00");t.setDate(t.getDate()+e),!(e>0&&v(t)>v(new Date))&&oe(v(t))}function lt(e){const[t,a]=e.split("-").map(Number),n=(new Date(t,a-1,1).getDay()+6)%7,s=new Date(t,a,0).getDate(),r=Array(n).fill(null);for(let i=1;i<=s;i++)r.push(`${e}-${String(i).padStart(2,"0")}`);for(;r.length<42;)r.push(null);return r}async function B(){const e=S,[t,a]=e.split("-").map(Number),n=`${e}-01`,s=`${e}-${String(new Date(t,a,0).getDate()).padStart(2,"0")}`,[r,i]=await Promise.all([m("joursEntre",{debut:n,fin:s}),m("marquesEntre",{debut:n,fin:s})]);if(e!==S)return;const c=new Map(r.map(l=>[l.jour,{n:l.n,kcal:l.kcal,marque:!1}]));for(const{jour:l}of i){const o=c.get(l);o?o.marque=!0:c.set(l,{n:0,kcal:0,marque:!0})}qe=c,z()}function pe(e){const[t,a]=S.split("-").map(Number),n=new Date(t,a-1+e,1),s=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`;s>v(new Date).slice(0,7)||(S=s,B())}function ut(){const e=v(new Date),t=lt(S),[a,n]=S.split("-").map(Number),s=new Date(a,n-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}),r=S===e.slice(0,7),i=$(`
    <aside class="calendrier" aria-label="Calendrier">
      <header class="calendrier__tete">
        <button data-mois-dec aria-label="Mois précédent">‹</button>
        <strong>${s}</strong>
        <button data-mois-inc aria-label="Mois suivant" ${r?"disabled":""}>›</button>
      </header>
      <div class="calendrier__jours-noms">${["L","M","M","J","V","S","D"].map(c=>`<span>${c}</span>`).join("")}</div>
      <div class="calendrier__grille">
        ${t.map(c=>{if(!c)return'<span class="calendrier__case calendrier__case--vide"></span>';const l=c===f,o=c===e,u=c>e,d=qe.get(c),p=!!d&&d.n>0,_=!!d?.marque;return`<button class="calendrier__case ${l?"calendrier__case--actif":""} ${o&&!l?"calendrier__case--auj":""} ${_?"calendrier__case--marque":""}"
                    data-jour="${c}" ${u?"disabled":""} aria-current="${o?"date":"false"}"
                    aria-label="${g(Se(c))}${p?", repas loggés":""}${_?", jour marqué":""}">
                    ${Number(c.slice(8))}${p||_?'<span class="calendrier__pastille"></span>':""}
                  </button>`}).join("")}
      </div>
    </aside>`);return i.querySelector("[data-mois-dec]").onclick=()=>pe(-1),i.querySelector("[data-mois-inc]").onclick=()=>pe(1),i.querySelectorAll("[data-jour]").forEach(c=>{c.onclick=()=>oe(c.dataset.jour)}),i}const X="2026-08-13",je=[{cle:"p7",label:"7 j",jours:7},{cle:"p30",label:"30 j",jours:30},{cle:"tout",label:"Tout",jours:null}];let K="p7",Te={valeur:null,jours:0};function pt(e){const t=v(new Date),a=je.find(r=>r.cle===e);if(a.jours===null)return{debut:X,fin:t};const n=new Date;n.setDate(n.getDate()-(a.jours-1));const s=v(n);return{debut:s<X?X:s,fin:t}}async function se(){const e=K,{debut:t,fin:a}=pt(e),n=await m("joursEntre",{debut:t,fin:a});if(e!==K)return;const s=n.length;Te={valeur:s?n.reduce((r,i)=>r+i.kcal,0)/s:null,jours:s},z()}function dt(){const{valeur:e,jours:t}=Te,a=$(`
    <aside class="moyenne" aria-label="Moyenne calorique">
      <div class="moyenne__periode">
        ${je.map(n=>`<button class="moyenne__pill ${n.cle===K?"moyenne__pill--actif":""}"
                                        data-periode="${n.cle}">${n.label}</button>`).join("")}
      </div>
      <div class="moyenne__valeur">
        <span class="chiffre chiffre--grand">${e===null?"—":h(e)}</span>
        <span class="unite">kcal / jour</span>
      </div>
      <p class="moyenne__detail">${t?`moyenne sur ${t} jour${t>1?"s":""} loggé${t>1?"s":""}`:"aucune donnée sur cette période"}</p>
    </aside>`);return a.querySelectorAll("[data-periode]").forEach(n=>{n.onclick=()=>{K=n.dataset.periode,se()}}),a}function mt(){const e=new Date(f+"T12:00:00"),t=f===v(new Date),a=$(`
    <header class="bandeau">
      <button data-dec aria-label="Jour précédent" title="Jour précédent (←)">‹</button>
      <button class="bandeau__date" data-aujourdhui ${t?"disabled":""}
              title="Revenir à aujourd'hui">
        <strong>${e.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</strong>
        <span>${t?"aujourd'hui":e.getFullYear()}</span>
      </button>
      <button data-inc aria-label="Jour suivant" title="Jour suivant (→)" ${t?"disabled":""}>›</button>
    </header>`);return a.querySelector("[data-dec]").onclick=()=>H(-1),a.querySelector("[data-inc]").onclick=()=>H(1),a.querySelector("[data-aujourdhui]").onclick=()=>oe(v(new Date)),a}function ft(){const e=$(`
    <div class="jour-meta">
      <label class="poids">
        <span>Poids</span>
        <span class="poids__saisie">
          <input type="number" inputmode="decimal" step="0.1" min="0"
                 placeholder="—" value="${O??""}">
          <span class="unite">kg</span>
        </span>
      </label>
      <label class="marque">
        <input type="checkbox" data-marque ${J?"checked":""}>
        <span>Marquer le jour</span>
      </label>
    </div>`),t=e.querySelector(".poids input");t.onchange=async()=>{const n=t.value.trim(),s=n===""?null:parseFloat(n);if(s!==null&&!(s>0)){t.value=String(O??"");return}O=s,await m("definirPoids",{jour:f,kg:s})},t.onkeydown=n=>{n.key==="Enter"&&t.blur()};const a=e.querySelector("[data-marque]");return a.onchange=async()=>{J=a.checked,await m("definirMarque",{jour:f,marque:J})},e}function gt(){const e=$('<button class="nouveau-repas">+ Ajouter un repas</button>');return e.onclick=async()=>{b=!1,U.length||await m("creerRepas",{jour:f}),await m("creerRepas",{jour:f}),w()},e}function Le(){const e=Pe(),t=$(`
    <footer class="pied">
      <button data-copier>Recopier un repas</button>
      <button data-export>Exporter</button>
      <button data-import>Restaurer</button>
      <button data-reset class="pied__danger">Repartir de zéro</button>
      ${`
        <button data-drive>${e.reconnexionRequise?"Se reconnecter à Drive":e.connecte?"Déconnecter Drive":"Connecter Drive"}</button>
        ${e.connecte||e.erreur?`<span class="pied__etat ${e.erreur?"pied__etat--erreur":""}" data-drive-etat></span>`:""}
      `}
      <input type="file" accept=".sqlite,.db" hidden data-fichier>
    </footer>`);t.querySelector("[data-copier]").onclick=()=>k({type:"copier"});const a=t.querySelector("[data-drive-etat]");a&&(a.textContent=`Drive : ${et(e)}`),t.querySelector("[data-drive]")?.addEventListener("click",()=>{e.connecte&&!e.reconnexionRequise?We():ze()}),t.querySelector("[data-export]").onclick=async()=>{const s=await m("exporter"),r=URL.createObjectURL(new Blob([s],{type:"application/vnd.sqlite3"}));Object.assign(document.createElement("a"),{href:r,download:`macros-${f}.sqlite`}).click(),URL.revokeObjectURL(r)};const n=t.querySelector("[data-fichier]");return t.querySelector("[data-import]").onclick=()=>n.click(),n.onchange=async()=>{const s=n.files?.[0];if(s){if(confirm(`Remplacer toute la base locale par ${s.name} ? Les repas actuels seront perdus.`))try{await Ee(new Uint8Array(await s.arrayBuffer()))}catch(r){alert(`Restauration impossible : ${r?.message??r}
La base actuelle est intacte.`)}n.value=""}},t.querySelector("[data-reset]").onclick=async()=>{confirm(`Effacer tous les repas et toutes les pesées ?
Les aliments sont conservés. C'est irréversible.`)&&(await m("reinitialiser"),T={kcal:0,arcs:[0,0,0]},b=!0,await w())},t}function ht(){document.querySelector(".pied")?.replaceWith(Le())}function z(){const e=U.length?U:[{id:null,ordre:1}],t=ct();te.replaceChildren(ut(),dt(),mt(),ft(),at(),...e.map(nt),gt(),Le(),...t?[t]:[]),b=!1}document.addEventListener("keydown",e=>{if(e.key==="Escape"&&y){k(null);return}y||e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName??"")||(e.key==="ArrowLeft"&&H(-1),e.key==="ArrowRight"&&H(1))});(async()=>{try{await Ce(),De(await m("ingredients")),await navigator.storage?.persist?.(),W(Qe),W(se),W(B),Fe(ht),Ne(Ee),await w(),B().catch(()=>{}),se().catch(()=>{}),Ve(),Xe().catch(()=>{})}catch(e){const t=String(e?.message??e),a=/Access Handle/i.test(t);te.replaceChildren($(`
      <div class="panne">
        <h2>${a?"Déjà ouverte dans un autre onglet":"La base n'a pas pu s'ouvrir"}</h2>
        ${a?`<p>Tes repas vivent dans un fichier SQLite que l'app verrouille en
               exclusivité — un seul onglet à la fois. Ferme les autres onglets
               de Macros, puis recharge.</p>`:`<p>Cette app stocke tes repas dans le navigateur (OPFS). Une fenêtre
               privée ou un navigateur trop ancien bloque ce stockage : réessaie
               dans un onglet normal, sur une version récente de Chrome, Firefox
               ou Safari.</p>`}
        <p class="panne__detail">${g(t)}</p>
        <button class="valider" data-recharger>Recharger</button>
      </div>`)),te.querySelector("[data-recharger]").onclick=()=>location.reload()}})();
