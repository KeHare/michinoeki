#!/usr/bin/env python3
# 詳細ページ131枚をパースし、公式一覧＋座標とマージして stations-full.json / stations-data.js を生成
import re, json, unicodedata, os

FAC_LABELS = {
    "icon_toiret":"トイレ", "icon_washlet":"温水洗浄便座", "icon_toiret_sinshosha":"身障者用トイレ",
    "icon_ostomeito":"オストメイト", "icon_parking":"駐車場", "icon_parking_yane":"屋根付き駐車場",
    "icon_ev":"EV充電器", "icon_wifi":"Wi-Fi", "icon_information":"インフォメーション",
    "icon_sinshosha":"身障者用設備", "icon_junyuu_omutu":"授乳室・おむつ交換台", "icon_shop":"ショップ",
    "icon_restaurant":"レストラン", "icon_cafe":"喫茶・軽食", "icon_sanchoku":"産地直売",
    "icon_credit":"クレジットカード", "icon_cashless":"キャッシュレス決済", "icon_dogrun":"ドッグラン",
    "icon_park":"公園",
}

def br2nl(s):
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'[ \t]+',' ', s).strip()

def parse_page(html):
    d = {}
    # 概要テーブル
    for th, td in re.findall(r'<tr>\s*<th>(.*?)</th>\s*<td>(.*?)</td>\s*</tr>', html, re.S):
        key = re.sub(r'<[^>]+>','',th).strip()
        val = br2nl(td)
        # HP等のリンク注記を落とす
        val = re.sub(r'【[^】]*HP】','',val).strip()
        d[key] = val
    # 設備
    idx = html.find('class="sec_facility"')
    facs = []
    if idx >= 0:
        seg = html[idx:idx+2500]
        for cls in re.findall(r'<li class="(icon_[a-z_]+)', seg):
            if cls in FAC_LABELS and FAC_LABELS[cls] not in facs:
                facs.append(FAC_LABELS[cls])
    # マップコード
    mc = re.search(r'icon_mapcode">([\d\s*]+)</li>', html)
    # 温泉ヒント: 本文テキストに強い温泉シグナルがあるか
    body = re.sub(r'<script.*?</script>', '', html, flags=re.S)
    body = re.sub(r'<[^>]+>', ' ', body)
    onsen = bool(re.search(r'日帰り入浴|入浴料|♨|天然温泉|温泉に入|温泉施設|かけ流し', body))
    # 公式ページのLeaflet地図から座標（最優先）
    coord = re.search(r'\[(\d{2}\.\d+),\s*(1[34]\d\.\d+)\]', html)
    latlon = (float(coord.group(1)), float(coord.group(2))) if coord else None
    # 休館日・開館時間が結合セルのケース
    hours = d.get("開館時間")
    holiday = d.get("休館日")
    combined = d.get("休館日 開館時間") or d.get("休館日開館時間")
    if combined and not hours:
        holiday = holiday or combined
    return {
        "latlon": latlon,
        "hours": hours,
        "holiday": holiday,
        "parking": d.get("駐車場"),
        "stamp_time": d.get("スタンプ 押印時間") or d.get("スタンプ押印時間"),
        "facilities": facs,
        "mapcode": mc.group(1).strip() if mc else None,
        "onsen": onsen,
    }

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'道の駅','',s)
    s = re.sub(r'[\s・☆★（）()「」〜~！!♡♥\.\-　＆&,、。]','',s)
    return s.lower()

def main():
    base = os.path.dirname(__file__)
    official = json.load(open(f"{base}/official_ichiran.json"))
    wiki = json.load(open(f"{base}/stations.json"))
    osm = json.load(open(f"{base}/osm_michinoeki_raw.json"))["elements"]

    wmap = {norm(s["name"]): s for s in wiki}
    osm_pts = []
    for e in osm:
        n = e["tags"].get("name","")
        lat = e.get("lat") or e.get("center",{}).get("lat")
        lon = e.get("lon") or e.get("center",{}).get("lon")
        if lat: osm_pts.append((norm(n), lat, lon))

    manual = {"しらぬか恋問館":"しらぬか恋問", "あびらd51(デゴイチ)ステーション":"あびらd51ステーション"}
    active = [o for o in official if "取消" not in o["name"]]

    out = []
    for o in active:
        key = norm(o["name"]); key2 = norm(manual.get(o["name"], o["name"]))
        w = wmap.get(key) or wmap.get(key2)
        lat=lon=region=None; routes=[]; furi=None
        if w:
            lat, lon = w["lat"], w["lon"]; region=w.get("region"); routes=w.get("routes",[]); furi=w.get("furigana")
        else:
            for nk, la, lo in osm_pts:
                if key and key in nk and len(key)>2:
                    lat, lon = la, lo; break
        # 詳細ページ
        det = {}
        p = f"{base}/pages/{o['page_id']}.html"
        if os.path.exists(p):
            det = parse_page(open(p, encoding='utf-8').read())
        # 公式ページの座標を最優先で上書き
        if det.get("latlon"):
            lat, lon = det["latlon"]
        # 地域区分（公式の番号順が振興局順ではないのでwiki優先、なければ空）
        rec = {
            "id": "hk%03d" % int(o["num"]) if o["num"].isdigit() else o["page_id"],
            "no": o["num"],
            "pageId": o["page_id"],
            "name": o["name"].replace('&nbsp;',' ').replace('\xa0',' ').strip(),
            "furigana": furi,
            "region": region,
            "muni": o["muni"],
            "tel": o["tel"] or None,
            "addr": o["addr"],
            "routes": routes,
            "lat": round(lat,6) if lat else None,
            "lon": round(lon,6) if lon else None,
            "hours": det.get("hours"),
            "holiday": det.get("holiday"),
            "parking": det.get("parking"),
            "stampTime": det.get("stamp_time"),
            "facilities": det.get("facilities", []),
            "onsen": bool(det.get("onsen")) or bool(re.search(r'温泉|入浴|♨|の湯', o["name"])),
            "mapcode": det.get("mapcode"),
            "url": f"https://hokkaido-michinoeki.jp/michinoeki/{o['page_id']}/",
        }
        out.append(rec)

    # 地域区分の欠落を地理的最近傍で補完
    import math
    def hav(a, b):
        R=6371; d=math.pi/180
        dla=(b[0]-a[0])*d; dlo=(b[1]-a[1])*d
        h=math.sin(dla/2)**2+math.cos(a[0]*d)*math.cos(b[0]*d)*math.sin(dlo/2)**2
        return 2*R*math.asin(math.sqrt(h))
    known = [r for r in out if r["region"] and r["lat"]]
    for r in out:
        if not r["region"] and r["lat"]:
            nearest = min(known, key=lambda k: hav((r["lat"],r["lon"]),(k["lat"],k["lon"])))
            r["region"] = nearest["region"]

    # sort by no
    out.sort(key=lambda r: int(r["no"]) if r["no"].isdigit() else 999)
    json.dump(out, open(f"{base}/stations-full.json","w"), ensure_ascii=False, indent=1)

    # 統計
    nolatlon = [r["name"] for r in out if not r["lat"]]
    nohours = [r["name"] for r in out if not r["hours"]]
    noregion = [r["name"] for r in out if not r["region"]]
    print("駅数:", len(out))
    print("座標なし:", nolatlon)
    print("営業時間なし:", len(nohours), nohours[:6])
    print("地域区分なし:", noregion)
    facs_all = [f for r in out for f in r["facilities"]]
    from collections import Counter
    print("設備分布:", dict(Counter(facs_all).most_common()))

    # アプリ用JS
    js = "// 北海道 道の駅データ 128駅（出典: 北の道の駅 公式サイト hokkaido-michinoeki.jp + Wikipedia/OSM座標 / 2026-07取得）\n"
    js += "const STATIONS = " + json.dumps(out, ensure_ascii=False, separators=(',',':')) + ";\n"
    open(f"{base}/../assets/stations-data.js","w").write(js)
    print("assets/stations-data.js 更新")

if __name__ == "__main__":
    main()
