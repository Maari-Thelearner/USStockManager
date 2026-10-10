(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0,10);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const n = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const money = (v, currency="USD") => new Intl.NumberFormat("en-US",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(n(v));
  const num = (v, digits=6) => n(v).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:digits});
  const pct = v => `${n(v).toFixed(1)}%`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const monthKey = d => String(d || "").slice(0,7);
  const monthLabel = () => new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const defaultState = () => ({
    schemaVersion:1,
    settings:{fx:96.75,gst:45,platformFee:0,buyCommission:0.02},
    monthlyBudget:50,
    assets:[
      {id:uid(),name:"NVIDIA",symbol:"NVDA",allocation:25,price:229.82},
      {id:uid(),name:"QQQM ETF",symbol:"QQQM",allocation:25,price:0},
      {id:uid(),name:"Microsoft",symbol:"MSFT",allocation:30,price:0},
      {id:uid(),name:"Alphabet",symbol:"GOOGL",allocation:20,price:0}
    ],
    wallet:[],orders:[]
  });
  const normalizeState = value => {
    const defaults=defaultState(), v=value||{};
    return {
      schemaVersion:1,
      settings:{...defaults.settings,...(v.settings||{})},
      monthlyBudget:Math.max(0,n(v.monthlyBudget,50)),
      assets:Array.isArray(v.assets)?v.assets:defaults.assets,
      wallet:Array.isArray(v.wallet)?v.wallet:[],
      orders:Array.isArray(v.orders)?v.orders:[]
    };
  };
  let state=defaultState(), accessKey="", saveTimer=null, dirty=false, loading=false;
  const config=window.PORTFOLIO_CONFIG||{};
  const apiBase=String(config.apiBaseUrl||"").replace(/\/+$/,"");
  const toast = message => { $("toastMessage").textContent=message; bootstrap.Toast.getOrCreateInstance($("appToast"),{delay:3000}).show(); };
  const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
  const showModal = id => modal(id).show();
  const hideModal = id => modal(id).hide();
  const setCloudStatus = (text,kind="ok",sub="Cloudflare D1") => {
    $("cloudStatus").textContent=text; $("cloudSubstatus").textContent=sub;
    $("statusDot").className=`status-dot ${kind==="error"?"error":kind==="wait"?"offline":""}`;
    document.querySelector(".cloud-chip .status-dot").className=`status-dot ${kind==="error"?"error":kind==="wait"?"offline":""}`;
  };
  const api = async (method="GET", body) => {
    if(!apiBase || apiBase.includes("YOUR-WORKER-NAME")) throw new Error("Set your Cloudflare Worker URL in site/config.js first.");
    const response=await fetch(`${apiBase}/api/state`,{
      method,headers:{"Content-Type":"application/json","X-Portfolio-Key":accessKey},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    let data={}; try{data=await response.json();}catch{}
    if(!response.ok) throw new Error(data.error||`Cloud API returned ${response.status}.`);
    return data;
  };
  const saveCloud = async () => {
    if(!dirty || loading || !accessKey) return;
    clearTimeout(saveTimer); dirty=false; setCloudStatus("Saving…","wait");
    try { await api("PUT",state); setCloudStatus("Cloud saved","ok","Changes synced"); }
    catch(err){dirty=true;setCloudStatus("Save failed","error","Check connection/key");toast(`Cloud save failed: ${err.message}`);}
  };
  const queueSave = () => { dirty=true;setCloudStatus("Unsaved changes","wait","Saving shortly…");clearTimeout(saveTimer);saveTimer=setTimeout(saveCloud,450); };
  const connect = async key => {
    accessKey=key.trim();
    if(!accessKey) throw new Error("Enter your shared access key.");
    sessionStorage.setItem("northstarPortfolioAccessKey",accessKey);
    setCloudStatus("Connecting…","wait");
    const result=await api("GET");
    if(result.state) state=normalizeState(result.state); else state=defaultState();
    loading=false; renderAll(); hideModal("keyModal"); setCloudStatus("Cloud connected","ok","Cloudflare D1");
    if(!result.state){queueSave();toast("Connected. Your new portfolio has been initialized.");}
  };
  const asset = id => state.assets.find(a=>a.id===id);
  const totalUsdCredited = () => state.wallet.reduce((s,w)=>s+n(w.usdCredited),0);
  const totalSpend = () => state.orders.reduce((s,o)=>s+n(o.totalSpend),0);
  const walletBalance = () => totalUsdCredited()-totalSpend();
  const orderPrincipal = o => Math.max(0,n(o.totalSpend)-n(o.commission));
  const orderShares = o => n(o.price)>0 ? orderPrincipal(o)/n(o.price) : 0;
  const ordersFor = id => state.orders.filter(o=>o.assetId===id);
  const holdingsFor = id => {
    const orders=ordersFor(id),shares=orders.reduce((s,o)=>s+orderShares(o),0),principal=orders.reduce((s,o)=>s+orderPrincipal(o),0),price=n(asset(id)?.price);
    return {orders,shares,principal,avg:shares?principal/shares:0,price,value:shares*price,pl:shares*price-principal,plPct:principal?(shares*price-principal)/principal*100:0};
  };
  const currentMonthOrders = () => state.orders.filter(o=>monthKey(o.date)===monthKey(today()));
  const monthInvestedFor = id => currentMonthOrders().filter(o=>o.assetId===id).reduce((s,o)=>s+orderPrincipal(o),0);
  const totalMonthInvested = () => currentMonthOrders().reduce((s,o)=>s+orderPrincipal(o),0);
  const targetUsd = a => state.monthlyBudget*n(a.allocation)/100;
  const totalAllocation = () => state.assets.reduce((s,a)=>s+n(a.allocation),0);
  const avatar = a => `<span class="asset-avatar">${esc((a.symbol||a.name||"?").slice(0,4).toUpperCase())}</span>`;
  const assetCell = a => `<div class="asset-cell">${avatar(a)}<div><div class="asset-name">${esc(a.name)}</div><div class="asset-symbol">${esc(a.symbol)}</div></div></div>`;
  const signedMoney = v => `<span class="${v>0?'positive':v<0?'negative':''}">${v>0?'+':''}${money(v)}</span>`;
  const actionButtons = (type,id) => `<button class="table-action" title="Edit" data-edit="${type}" data-id="${esc(id)}"><i class="bi bi-pencil"></i></button><button class="table-action" title="Delete" data-delete="${type}" data-id="${esc(id)}"><i class="bi bi-trash3"></i></button>`;
  const pageMeta={dashboard:["YOUR MONEY, IN ONE VIEW","Portfolio overview"],wallet:["CASH MANAGEMENT","USD wallet"],allocations:["PLAN YOUR MONTH","Monthly plan"],orders:["TRANSACTION RECORD","Buy orders"],assets:["TRACK YOUR POSITIONS","Watchlist & holdings"],settings:["PREFERENCES","Settings & backup"]};
  function goPage(page){
    if(!pageMeta[page])return;
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
    document.querySelectorAll(".nav-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("pageEyebrow").textContent=pageMeta[page][0];$("pageTitle").textContent=pageMeta[page][1];
    $("sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"});
  }
  function renderDashboard(){
    const all=state.assets.map(a=>({a,h:holdingsFor(a.id)})).filter(x=>x.h.shares>0);
    const invested=all.reduce((s,x)=>s+x.h.principal,0),value=all.reduce((s,x)=>s+x.h.value,0),pl=value-invested,plPct=invested?pl/invested*100:0;
    $("metricValue").textContent=money(value);$("metricInvested").textContent=money(invested);$("metricPL").textContent=`${pl>0?"+":""}${money(pl)}`;
    $("metricPL").className=`metric-value ${pl>0?"positive":pl<0?"negative":""}`;$("metricPLFoot").innerHTML=`<span class="${pl>0?"positive":pl<0?"negative":""}">${plPct>0?"+":""}${plPct.toFixed(2)}%</span> unrealized return`;
    $("metricWallet").textContent=money(walletBalance());$("todayLabel").textContent=new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    const rows=all.map(({a,h})=>`<tr><td>${assetCell(a)}</td><td>${num(h.shares,6)}</td><td>${money(h.avg)}</td><td>${money(h.price)}</td><td><strong>${money(h.value)}</strong></td><td>${signedMoney(h.pl)}<div class="asset-symbol">${h.plPct.toFixed(2)}%</div></td></tr>`).join("");
    $("holdingsTable").innerHTML=rows;$("holdingsEmpty").classList.toggle("d-none",all.length>0);
    $("allocationMonthLabel").textContent=`${monthLabel()} budget progress`;$("budgetTotal").textContent=money(state.monthlyBudget);
    const spent=totalMonthInvested(),remaining=state.monthlyBudget-spent,progress=state.monthlyBudget>0?Math.min(100,spent/state.monthlyBudget*100):0;
    $("budgetProgress").style.width=`${progress}%`;$("budgetSpent").textContent=`${money(spent)} spent`;$("budgetRemaining").textContent=`${money(remaining)} ${remaining<0?"over budget":"left"}`;
    $("miniAllocations").innerHTML=state.assets.map(a=>`<div class="mini-row">${avatar(a)}<div class="mini-info"><strong>${esc(a.name)}</strong><small>${pct(a.allocation)} of budget</small></div><div class="mini-amount">${money(monthInvestedFor(a.id))}<small>of ${money(targetUsd(a))}</small></div></div>`).join("")||'<div class="empty-state">Add assets to create a plan.</div>';
    const activities=[
      ...state.wallet.map(w=>({date:w.date,type:"funding",title:"Wallet funding",detail:`₹${num(w.inrSent,2)} converted at ₹${num(w.fx,4)}/USD`,amount:`+${money(w.usdCredited)}`,sort:w.date})),
      ...state.orders.map(o=>({date:o.date,type:"buy",title:`Bought ${asset(o.assetId)?.symbol||"asset"}`,detail:`${num(orderShares(o),6)} shares at ${money(o.price)}`,amount:`−${money(o.totalSpend)}`,sort:o.date}))
    ].sort((a,b)=>String(b.sort).localeCompare(String(a.sort))).slice(0,5);
    $("recentActivity").innerHTML=activities.map(x=>`<div class="activity-row"><span class="activity-icon"><i class="bi ${x.type==="funding"?"bi-wallet2":"bi-arrow-down-left-circle"}"></i></span><div class="activity-info"><strong>${esc(x.title)}</strong><small>${esc(x.date||"—")} · ${esc(x.detail)}</small></div><div class="activity-amount ${x.type==="funding"?"positive":""}">${x.amount}</div></div>`).join("")||'<div class="empty-state">Your recent activity will appear here.</div>';
  }
  function renderWallet(){
    $("walletCredited").textContent=money(totalUsdCredited());$("walletSpent").textContent=money(totalSpend());$("walletAvailable").textContent=money(walletBalance());
    $("walletTable").innerHTML=state.wallet.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(w=>`<tr><td>${esc(w.date||"—")}</td><td>₹${num(w.inrSent,2)}</td><td>${num(w.fx,4)}</td><td>₹${num(n(w.gst)+n(w.platformFee),2)}</td><td><strong>${money(w.usdCredited)}</strong></td><td>${esc(w.note||"—")}</td><td>${actionButtons("wallet",w.id)}</td></tr>`).join("");
    $("walletEmpty").classList.toggle("d-none",state.wallet.length>0);
  }
  function renderAllocations(){
    $("allocMonthHeading").textContent=monthLabel();$("allocationBudgetBig").textContent=money(state.monthlyBudget);
    const total=totalAllocation();$("allocationTotalPct").textContent=`${num(total,1)}% allocated`;$("allocationWarning").classList.toggle("d-none",Math.abs(total-100)<0.05);
    $("allocationCards").innerHTML=state.assets.map(a=>{
      const target=targetUsd(a),spent=monthInvestedFor(a.id),progress=target>0?Math.min(100,spent/target*100):0,remaining=target-spent;
      const status=spent>=target&&target>0?"Target reached":spent>0?"In progress":"Not started",cls=spent>=target&&target>0?"":spent>0?"pending":"pending";
      return `<div class="allocation-card"><div class="allocation-card-head">${avatar(a)}<div class="allocation-card-title"><strong>${esc(a.name)}</strong><span>${esc(a.symbol)} · ${pct(a.allocation)}</span></div><div class="card-actions">${actionButtons("asset",a.id)}</div></div><div class="target-amount">${money(target)}</div><div class="target-caption">Monthly target</div><div class="progress"><div class="progress-bar" style="width:${progress}%"></div></div><div class="progress-details"><span>${money(spent)} invested</span><strong>${pct(progress)}</strong></div><div class="progress-details mt-2"><span>${remaining>=0?money(remaining)+" remaining":money(-remaining)+" over target"}</span><span>Budget share ${pct(a.allocation)}</span></div><span class="allocation-status ${cls}">${status}</span></div>`;
    }).join("")||'<div class="empty-state">Add assets to build your monthly plan.</div>';
  }
  function renderOrders(){
    $("ordersTable").innerHTML=state.orders.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(o=>`<tr><td>${esc(o.date||"—")}</td><td>${assetCell(asset(o.assetId)||{name:"Deleted asset",symbol:"—"})}</td><td>${money(o.price)}</td><td><strong>${money(o.totalSpend)}</strong></td><td>${money(o.commission)}</td><td>${num(orderShares(o),8)}</td><td>${actionButtons("order",o.id)}</td></tr>`).join("");
    $("ordersEmpty").classList.toggle("d-none",state.orders.length>0);
  }
  function renderAssets(){
    $("assetsTable").innerHTML=state.assets.map(a=>{const h=holdingsFor(a.id);return `<tr><td>${assetCell(a)}</td><td>${pct(a.allocation)}</td><td><input class="price-inline" data-price="${esc(a.id)}" type="number" min="0" step="0.0001" value="${n(a.price)}" aria-label="Current price for ${esc(a.symbol)}"><button class="table-action save-price" data-save-price="${esc(a.id)}" title="Save price"><i class="bi bi-check-lg"></i></button></td><td>${num(h.shares,6)}</td><td><strong>${money(h.value)}</strong></td><td>${actionButtons("asset",a.id)}</td></tr>`;}).join("");
    $("assetsEmpty").classList.toggle("d-none",state.assets.length>0);
    $("assetAllocationTotal").textContent=`${num(totalAllocation(),1)}% allocated`;
    $("orderAsset").innerHTML=state.assets.map(a=>`<option value="${esc(a.id)}">${esc(a.symbol)} — ${esc(a.name)}</option>`).join("");
  }
  function renderSettings(){
    $("settingFx").value=state.settings.fx;$("settingGst").value=state.settings.gst;$("settingPlatformFee").value=state.settings.platformFee;$("settingCommission").value=state.settings.buyCommission;
    $("apiEndpointLabel").textContent=apiBase||"Not configured";
  }
  function renderAll(){renderDashboard();renderWallet();renderAllocations();renderOrders();renderAssets();renderSettings();}
  function openAsset(id){
    const a=asset(id);$("assetForm").reset();$("assetId").value=a?.id||"";$("assetModalTitle").textContent=a?"Edit asset":"Add asset";
    $("assetName").value=a?.name||"";$("assetSymbol").value=a?.symbol||"";$("assetAllocation").value=a?.allocation??0;$("assetPrice").value=a?.price??0;showModal("assetModal");
  }
  function openWallet(id){
    const w=state.wallet.find(x=>x.id===id);$("walletForm").reset();delete $("walletUsd").dataset.touched;$("walletId").value=w?.id||"";$("walletModalTitle").textContent=w?"Edit wallet funding":"Record wallet funding";
    $("walletDate").value=w?.date||today();$("walletInr").value=w?.inrSent??"";$("walletFx").value=w?.fx??state.settings.fx;$("walletGst").value=w?.gst??state.settings.gst;$("walletFee").value=w?.platformFee??state.settings.platformFee;$("walletNote").value=w?.note||"";
    $("walletUsd").value=w?.usdCredited??"";calcWalletEstimate();if(!w)$("walletUsd").value="";showModal("walletModal");
  }
  function calcWalletEstimate(){
    const inr=n($("walletInr").value),fx=n($("walletFx").value),fees=n($("walletGst").value)+n($("walletFee").value);
    const estimate=fx>0?Math.max(0,inr-fees)/fx:0;$("walletEstimate").textContent=money(estimate);
    if(!$("walletId").value && $("walletInr").value && fx>0 && !$("walletUsd").dataset.touched)$("walletUsd").value=estimate.toFixed(4);
  }
  function openOrder(id){
    const o=state.orders.find(x=>x.id===id);$("orderForm").reset();$("orderId").value=o?.id||"";$("orderModalTitle").textContent=o?"Edit buy order":"Add buy order";
    $("orderDate").value=o?.date||today();$("orderAsset").value=o?.assetId||state.assets[0]?.id||"";
    $("orderPrice").value=o?.price??(asset($("orderAsset").value)?.price||"");$("orderSpend").value=o?.totalSpend??"";$("orderCommission").value=o?.commission??state.settings.buyCommission;calcOrderPreview();showModal("orderModal");
  }
  function calcOrderPreview(){
    const price=n($("orderPrice").value),spend=n($("orderSpend").value),commission=n($("orderCommission").value),principal=Math.max(0,spend-commission);
    $("orderSharesPreview").textContent=num(price>0?principal/price:0,8);$("orderPrincipalPreview").textContent=money(principal);
  }
  function exportBackup(){
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),app:"Northstar US Stock Portfolio Tracker",state},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`northstar-portfolio-${today()}.json`;a.click();URL.revokeObjectURL(url);toast("JSON backup exported.");
  }
  async function importBackup(file){
    try{const parsed=JSON.parse(await file.text()),candidate=normalizeState(parsed.state||parsed);if(!Array.isArray(candidate.assets)||!Array.isArray(candidate.orders)||!Array.isArray(candidate.wallet))throw new Error("Backup structure is invalid.");
      if(!confirm("Importing replaces all current portfolio data in the cloud. Continue?"))return;
      state=candidate;renderAll();dirty=true;await saveCloud();toast("Backup imported to cloud.");
    }catch(err){toast(`Import failed: ${err.message}`);}finally{$("importFile").value="";}
  }
  function deleteRecord(type,id){
    if(!confirm("Delete this record? This change will be saved to your cloud database."))return;
    if(type==="asset"){
      if(state.orders.some(o=>o.assetId===id)&&!confirm("This asset has buy orders. Deleting it will remove those orders too. Continue?"))return;
      state.assets=state.assets.filter(a=>a.id!==id);state.orders=state.orders.filter(o=>o.assetId!==id);
    }else if(type==="wallet")state.wallet=state.wallet.filter(w=>w.id!==id);
    else if(type==="order")state.orders=state.orders.filter(o=>o.id!==id);
    renderAll();queueSave();toast("Record deleted.");
  }
  function bindEvents(){
    document.querySelectorAll(".nav-link[data-page]").forEach(b=>b.addEventListener("click",()=>goPage(b.dataset.page)));
    document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>goPage(b.dataset.goto)));
    document.querySelectorAll("[data-page='dashboard']").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();goPage("dashboard");}));
    $("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
    $("quickBuy").addEventListener("click",()=>openOrder());$("addOrderBtn").addEventListener("click",()=>openOrder());$("addAssetBtn").addEventListener("click",()=>openAsset());$("addWalletBtn").addEventListener("click",()=>openWallet());$("editBudgetBtn").addEventListener("click",()=>{const value=prompt("Enter your monthly USD budget:",String(state.monthlyBudget));if(value===null)return;if(!Number.isFinite(Number(value))||Number(value)<0){toast("Enter a valid non-negative budget.");return;}state.monthlyBudget=Number(value);renderAll();queueSave();});
    $("changeKeyBtn").addEventListener("click",()=>{sessionStorage.removeItem("northstarPortfolioAccessKey");accessKey="";$("accessKeyInput").value="";$("keyError").textContent="";showModal("keyModal");});
    $("connectBtn").addEventListener("click",async()=>{const key=$("accessKeyInput").value;$("keyError").textContent="";$("connectBtn").disabled=true;try{await connect(key);}catch(err){$("keyError").textContent=err.message;setCloudStatus("Not connected","error","Check key / API URL");}finally{$("connectBtn").disabled=false;}});
    $("assetForm").addEventListener("submit",e=>{e.preventDefault();const id=$("assetId").value,record={id:id||uid(),name:$("assetName").value.trim(),symbol:$("assetSymbol").value.trim().toUpperCase(),allocation:n($("assetAllocation").value),price:n($("assetPrice").value)};if(id)state.assets=state.assets.map(a=>a.id===id?record:a);else state.assets.push(record);hideModal("assetModal");renderAll();queueSave();toast("Asset saved to cloud.");});
    ["walletInr","walletFx","walletGst","walletFee"].forEach(id=>$(id).addEventListener("input",()=>{delete $("walletUsd").dataset.touched;calcWalletEstimate();}));
    $("walletUsd").addEventListener("input",()=>{$("walletUsd").dataset.touched="1";});
    $("walletForm").addEventListener("submit",e=>{e.preventDefault();const id=$("walletId").value,record={id:id||uid(),date:$("walletDate").value,inrSent:n($("walletInr").value),fx:n($("walletFx").value),gst:n($("walletGst").value),platformFee:n($("walletFee").value),usdCredited:n($("walletUsd").value),note:$("walletNote").value.trim()};if(id)state.wallet=state.wallet.map(w=>w.id===id?record:w);else state.wallet.push(record);hideModal("walletModal");renderAll();queueSave();toast("Wallet funding saved.");});
    ["orderPrice","orderSpend","orderCommission"].forEach(id=>$(id).addEventListener("input",calcOrderPreview));
    $("orderAsset").addEventListener("change",()=>{if(!$("orderId").value)$("orderPrice").value=asset($("orderAsset").value)?.price||0;calcOrderPreview();});
    $("orderForm").addEventListener("submit",e=>{e.preventDefault();const id=$("orderId").value,record={id:id||uid(),date:$("orderDate").value,assetId:$("orderAsset").value,price:n($("orderPrice").value),totalSpend:n($("orderSpend").value),commission:n($("orderCommission").value)};if(record.totalSpend<record.commission){toast("Total spend must be greater than or equal to commission.");return;}if(id)state.orders=state.orders.map(o=>o.id===id?record:o);else state.orders.push(record);const a=asset(record.assetId);if(a&&record.price>0)a.price=record.price;hideModal("orderModal");renderAll();queueSave();toast("Buy order saved.");});
    $("settingsForm").addEventListener("submit",e=>{e.preventDefault();state.settings={fx:n($("settingFx").value),gst:n($("settingGst").value),platformFee:n($("settingPlatformFee").value),buyCommission:n($("settingCommission").value)};renderSettings();queueSave();toast("Settings saved.");});
    $("exportBtn").addEventListener("click",exportBackup);$("importFile").addEventListener("change",e=>{if(e.target.files?.[0])importBackup(e.target.files[0]);});
    $("resetBtn").addEventListener("click",async()=>{if(!confirm("This permanently replaces the cloud portfolio with an empty default portfolio. Export a backup first if needed. Continue?"))return;state=defaultState();renderAll();dirty=true;await saveCloud();toast("Portfolio reset.");});
    document.body.addEventListener("click",e=>{
      const edit=e.target.closest("[data-edit]");if(edit){const type=edit.dataset.edit,id=edit.dataset.id;if(type==="asset")openAsset(id);if(type==="wallet")openWallet(id);if(type==="order")openOrder(id);return;}
      const del=e.target.closest("[data-delete]");if(del){deleteRecord(del.dataset.delete,del.dataset.id);return;}
      const savePrice=e.target.closest("[data-save-price]");if(savePrice){const id=savePrice.dataset.savePrice,field=document.querySelector(`[data-price="${CSS.escape(id)}"]`),a=asset(id);if(a&&field&&n(field.value)>=0){a.price=n(field.value);renderAll();queueSave();toast("Market price updated.");}}
    });
    window.addEventListener("online",()=>{if(dirty)saveCloud();else setCloudStatus("Online","ok");});
    window.addEventListener("offline",()=>setCloudStatus("Offline","wait","Changes may not sync"));
    window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue="";}});
  }
  async function init(){
    bindEvents();$("todayLabel").textContent=new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});$("apiEndpointLabel").textContent=apiBase||"Not configured";
    const savedKey=sessionStorage.getItem("northstarPortfolioAccessKey");
    if(savedKey){$("accessKeyInput").value=savedKey;try{await connect(savedKey);}catch(err){sessionStorage.removeItem("northstarPortfolioAccessKey");accessKey="";$("keyError").textContent=`Could not connect: ${err.message}`;showModal("keyModal");}}
    else showModal("keyModal");
    if(!apiBase||apiBase.includes("YOUR-WORKER-NAME")){$("keyError").textContent="First deploy the Cloudflare Worker, then set its URL in site/config.js.";}
  }
  init();
})();