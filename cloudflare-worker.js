/*
 * 店舗管理アプリ 同期サーバー（Cloudflare Workers 版）
 * ==================================================================
 * インストール作業は一切ありません。ブラウザ上の操作だけで完了します。
 * 無料・クレジットカード不要・約10分。
 *
 * 【手順】
 *
 *  1. https://dash.cloudflare.com/sign-up でアカウントを作る（無料）
 *
 *  2. 左メニュー「Storage & Databases」→「KV」→「Create a namespace」
 *     Namespace name に  store-data  と入れて作成
 *
 *  3. 左メニュー「Compute (Workers)」→「Create」→「Start with Hello World!」
 *     → 名前はそのままで「Deploy」
 *
 *  4. デプロイ後の画面で「Edit code」→ 出ているコードを全部消して、
 *     このファイルの中身を全部貼り付け →「Deploy」
 *
 *  5. Worker の「Settings」→「Bindings」→「+ Add」→「KV namespace」
 *       Variable name : STORE
 *       KV namespace  : 手順2で作った store-data を選ぶ
 *     →「Deploy」
 *
 *  6. 画面上部に出ている  https://〇〇〇.workers.dev  をコピーし、
 *     末尾に  /sync  を付けたものを控える
 *       例）https://mystore.hanako.workers.dev/sync
 *
 *  7. 各タブレットでアプリを開き
 *     設定 →「連携とデータ」→「他の端末と同期するURL」にそのURLを貼り付け
 *     →「接続テスト」を押して「✓ 接続できました」が出ればOK
 *
 *     14台すべてに同じURLを入れてください。これで完了です。
 *
 * ------------------------------------------------------------------
 * 【セキュリティ】
 *  下の SECRET に合言葉を設定すると、URLに ?key=合言葉 を付けた端末だけが
 *  接続できるようになります。売上やお客様名を扱うので、設定を推奨します。
 *    例）SECRET = "kai2026club"
 *        URL    = https://〇〇〇.workers.dev/sync?key=kai2026club
 */

const SECRET = "";   // 例: "kai2026club"（空なら誰でもアクセス可）

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default {
  async fetch(request, env) {
    // ブラウザが事前に投げてくる確認リクエスト
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);

    // 動作確認用：ブラウザでルートを開くと状態が見られる
    if (url.pathname === "/") {
      return json({
        ok: true,
        message: "店舗管理アプリの同期サーバーは動いています。",
        syncUrl: url.origin + "/sync" + (SECRET ? "?key=あなたの合言葉" : ""),
        kvBinding: env.STORE ? "設定済み" : "未設定（Settings → Bindings で STORE を追加してください）"
      });
    }

    if (url.pathname !== "/sync") return json({ error: "not found. use /sync" }, 404);

    if (SECRET && url.searchParams.get("key") !== SECRET) {
      return json({ error: "unauthorized. URLの ?key= が違います" }, 401);
    }

    if (!env.STORE) {
      return json({ error: "KV namespace 'STORE' が未設定です。手順5をやり直してください" }, 500);
    }

    /* --- 最新の状態を返す --- */
    if (request.method === "GET") {
      const raw = await env.STORE.get("state");
      if (!raw) return json({ rev: 0, data: null });
      return new Response(raw, {
        headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
      });
    }

    /* --- 受け取った状態を保存する --- */
    if (request.method === "POST") {
      let m;
      try { m = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
      if (!m || !m.data) return json({ error: "no data" }, 400);

      // サーバー側で通し番号を振る（どの端末が最後に書いたか判定するため）
      let prevRev = 0;
      const prevRaw = await env.STORE.get("state");
      if (prevRaw) { try { prevRev = JSON.parse(prevRaw).rev || 0; } catch (e) {} }

      const rev = prevRev + 1;
      await env.STORE.put("state", JSON.stringify({
        from: m.from || "unknown", rev, at: Date.now(), data: m.data
      }));

      return json({ ok: true, rev });
    }

    return json({ error: "method not allowed" }, 405);
  }
};
