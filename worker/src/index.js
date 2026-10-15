const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const uid = () => crypto.randomUUID();
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const corsOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
    const cors = { 'access-control-allow-origin': corsOrigin, 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type,X-App-Key', 'vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') return json({ app: 'USStockManager API', ok: true }, 200, cors);
    if (!env.APP_ACCESS_KEY || request.headers.get('X-App-Key') !== env.APP_ACCESS_KEY) return json({ error: 'Unauthorized. Check APP_ACCESS_KEY.' }, 401, cors);
    const db = env.DB;
    const body = async () => { try { return await request.json(); } catch { return {}; } };
    const parts = url.pathname.split('/').filter(Boolean);
    const resource = parts[1]; const id = parts[2];
    try {
      if (resource === 'state' && request.method === 'GET') {
        const [settings, assets, funding, plans, orders] = await Promise.all([
          db.prepare('SELECT * FROM settings WHERE id=1').first(),
          db.prepare('SELECT * FROM assets ORDER BY symbol').all(),
          db.prepare('SELECT * FROM funding ORDER BY funding_date DESC, created_at DESC').all(),
          db.prepare('SELECT * FROM monthly_plans ORDER BY month DESC').all(),
          db.prepare('SELECT * FROM orders ORDER BY order_date DESC, created_at DESC').all()
        ]);
        return json({ settings, assets: assets.results, funding: funding.results, plans: plans.results, orders: orders.results }, 200, cors);
      }
      if (resource === 'settings') {
        if (request.method === 'GET') return json(await db.prepare('SELECT * FROM settings WHERE id=1').first(), 200, cors);
        if (request.method === 'PUT' || request.method === 'POST') {
          const b = await body();
          await db.prepare('UPDATE settings SET fx_rate=?, gst_inr=?, platform_fee_inr=?, buy_commission_usd=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(Math.max(0,num(b.fx_rate,95.75)),Math.max(0,num(b.gst_inr,45)),Math.max(0,num(b.platform_fee_inr,0)),Math.max(0,num(b.buy_commission_usd,0.01))).run();
          return json(await db.prepare('SELECT * FROM settings WHERE id=1').first(), 200, cors);
        }
      }
      if (resource === 'assets') {
        if (request.method === 'GET') { const r = await db.prepare('SELECT * FROM assets ORDER BY symbol').all(); return json(r.results,200,cors); }
        if (request.method === 'POST') {
          const b = await body(); const aid = uid();
          if (!b.symbol || !b.name) return json({error:'Symbol and name are required.'},400,cors);
          await db.prepare('INSERT INTO assets(id,symbol,name,category,allocation_pct,notes) VALUES(?,?,?,?,?,?)').bind(aid,String(b.symbol).trim().toUpperCase(),String(b.name).trim(),b.category||'Stock',num(b.allocation_pct),b.notes||'').run();
          return json(await db.prepare('SELECT * FROM assets WHERE id=?').bind(aid).first(),201,cors);
        }
        if (id && request.method === 'PUT') {
          const b = await body(); if (!b.symbol || !b.name) return json({error:'Symbol and name are required.'},400,cors);
          await db.prepare('UPDATE assets SET symbol=?,name=?,category=?,allocation_pct=?,notes=? WHERE id=?').bind(String(b.symbol).trim().toUpperCase(),String(b.name).trim(),b.category||'Stock',num(b.allocation_pct),b.notes||'',id).run();
          return json(await db.prepare('SELECT * FROM assets WHERE id=?').bind(id).first(),200,cors);
        }
        if (id && request.method === 'DELETE') { const used=await db.prepare('SELECT COUNT(*) n FROM orders WHERE asset_id=?').bind(id).first(); if(used.n) return json({error:'This asset has buy orders. Delete those orders first.'},409,cors); await db.prepare('DELETE FROM assets WHERE id=?').bind(id).run(); return json({ok:true},200,cors); }
      }
      if (resource === 'funding') {
        if (request.method === 'GET') { const r=await db.prepare('SELECT * FROM funding ORDER BY funding_date DESC,created_at DESC').all(); return json(r.results,200,cors); }
        if (request.method === 'POST' || (id && request.method === 'PUT')) {
          const b=await body(); if(!b.funding_date || num(b.usd_credited)<=0) return json({error:'Date and positive USD credited are required.'},400,cors);
          const fid=id||uid(); const vals=[b.funding_date,num(b.inr_sent),num(b.fx_rate),num(b.gst_inr),num(b.platform_fee_inr),num(b.other_fees_inr),num(b.usd_credited),b.notes||''];
          if(id) await db.prepare('UPDATE funding SET funding_date=?,inr_sent=?,fx_rate=?,gst_inr=?,platform_fee_inr=?,other_fees_inr=?,usd_credited=?,notes=? WHERE id=?').bind(...vals,fid).run();
          else await db.prepare('INSERT INTO funding(id,funding_date,inr_sent,fx_rate,gst_inr,platform_fee_inr,other_fees_inr,usd_credited,notes) VALUES(?,?,?,?,?,?,?,?,?)').bind(fid,...vals).run();
          return json(await db.prepare('SELECT * FROM funding WHERE id=?').bind(fid).first(),id?200:201,cors);
        }
        if(id && request.method==='DELETE'){await db.prepare('DELETE FROM funding WHERE id=?').bind(id).run();return json({ok:true},200,cors);}
      }
      if (resource === 'plans') {
        if(request.method==='GET'){const r=await db.prepare('SELECT * FROM monthly_plans ORDER BY month DESC').all();return json(r.results,200,cors);}
        if(request.method==='POST'||request.method==='PUT'){const b=await body();if(!/^\d{4}-\d{2}$/.test(b.month||''))return json({error:'Month must be YYYY-MM.'},400,cors);await db.prepare('INSERT INTO monthly_plans(month,budget_usd,notes) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET budget_usd=excluded.budget_usd,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP').bind(b.month,Math.max(0,num(b.budget_usd)),b.notes||'').run();return json(await db.prepare('SELECT * FROM monthly_plans WHERE month=?').bind(b.month).first(),200,cors);}
        if(id&&request.method==='DELETE'){await db.prepare('DELETE FROM monthly_plans WHERE month=?').bind(id).run();return json({ok:true},200,cors);}
      }
      if (resource === 'orders') {
        if(request.method==='GET'){const r=await db.prepare('SELECT * FROM orders ORDER BY order_date DESC,created_at DESC').all();return json(r.results,200,cors);}
        if(request.method==='POST'||(id&&request.method==='PUT')){
          const b=await body();if(!b.order_date||!b.asset_id||num(b.total_spend_usd)<=0||num(b.shares)<=0)return json({error:'Date, asset, positive total spend and shares are required.'},400,cors);
          const asset=await db.prepare('SELECT * FROM assets WHERE id=?').bind(b.asset_id).first();if(!asset)return json({error:'Choose a valid asset.'},400,cors);
          const oid=id||uid();const vals=[b.order_date,asset.id,asset.symbol,num(b.price_per_share),num(b.total_spend_usd),num(b.commission_usd),num(b.shares),b.notes||''];
          if(id)await db.prepare('UPDATE orders SET order_date=?,asset_id=?,symbol=?,price_per_share=?,total_spend_usd=?,commission_usd=?,shares=?,notes=? WHERE id=?').bind(...vals,oid).run();
          else await db.prepare('INSERT INTO orders(id,order_date,asset_id,symbol,price_per_share,total_spend_usd,commission_usd,shares,notes) VALUES(?,?,?,?,?,?,?,?,?)').bind(oid,...vals).run();
          return json(await db.prepare('SELECT * FROM orders WHERE id=?').bind(oid).first(),id?200:201,cors);
        }
        if(id&&request.method==='DELETE'){await db.prepare('DELETE FROM orders WHERE id=?').bind(id).run();return json({ok:true},200,cors);}
      }
      if(resource==='quotes'&&request.method==='POST'){
        const b=await body();const symbols=Array.isArray(b.symbols)?b.symbols:[];const results=[];
        for(const raw of symbols.slice(0,60)){
          const symbol=String(raw).trim().toUpperCase();if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol))continue;
          try{const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`,{headers:{'User-Agent':'Mozilla/5.0 USStockManager/1.0'}});if(!response.ok)throw new Error(`Quote provider HTTP ${response.status}`);const data=await response.json();const result=data?.chart?.result?.[0];const price=result?.meta?.regularMarketPrice;if(!Number.isFinite(price))throw new Error('No price returned');await db.prepare('UPDATE assets SET last_price=?,price_updated_at=CURRENT_TIMESTAMP WHERE symbol=?').bind(price,symbol).run();results.push({symbol,price,ok:true});}catch(e){results.push({symbol,ok:false,error:e.message});}
        }
        return json({results},200,cors);
      }
      return json({error:'Not found.'},404,cors);
    } catch (e) {
      const message = String(e?.message || e);
      const status = /UNIQUE constraint failed/i.test(message) ? 409 : 500;
      return json({ error: status===409 ? 'That symbol already exists.' : message }, status, cors);
    }
  }
};
