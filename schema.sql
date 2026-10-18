-- 廻（めぐり）合言葉でつなぐ旅帳
-- 作成: npx wrangler d1 execute michinoeki-meguri --remote --file=schema.sql
-- k = ブラウザで sha256("meguri|合言葉") にしたもの。サーバは合言葉そのものを知らない
-- state = {marks:{visited|want|trip:{駅id:[1/0, 変更時刻]}}, vdate:{駅id:日付}, plan:{…,t,by}, drive:{…,t,by}}
-- ver = 書くたびに+1（同時に書いたときの取りこぼし防止＝楽観ロック）
CREATE TABLE IF NOT EXISTS tabi (
  k       TEXT PRIMARY KEY,
  state   TEXT NOT NULL,
  ver     INTEGER NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
