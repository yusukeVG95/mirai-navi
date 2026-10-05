# みらい留学受検ナビ：データ更新手順

サイト本体は `index.html` 1枚（データは `SCHOOLS` 配列に埋め込み）。公開URL：https://juken-chat.c-mirai.jp/schedule/
（GitHub Pages `https://yusukevg95.github.io/mirai-navi/` の内容が中継されて表示される。）

## 更新の全体像（週1回・日曜を想定）
1. **イベント情報の更新**（c-mirai.jp のイベント一覧から機械的に取得）
2. **日程・入寮情報の再調査**（「前年度参考（R8ref）」「空欄」を令和9年度の公式情報で埋める）
3. 検証 → `DATA_UPDATED` 更新 → コミット/プッシュ → Artifact版も更新

## 1. イベントの更新
c-mirai.jp は非ブラウザからのアクセスを 429 で拒否するため、**ブラウザ（Claudeの Browser ツール）上で取得**する。
1. ローカル受け口を起動: `node --max-http-header-size=4000000 tools/recv.js C:/temp/refresh`
2. Browser で `https://c-mirai.jp/events` を開き、`tools/scrape_events.browser.js` の内容を javascript_tool で実行（`window.__payload` に結果が入る）
3. 同じタブで `location.href = 'http://localhost:8799/save?name=events_full.json&d=' + encodeURIComponent(window.__payload)` を実行
4. `node tools/refresh_events.js C:/temp/refresh/events_full.json C:/temp/refresh/patch_events.json`
   - 出演校名→学校IDを自動突合。`UNMATCHED` に学校名が出たら（事務局・教委以外）データ未収録の新規参画校の可能性あり
5. `node tools/apply_patches.js C:/temp/refresh/patch_events.json`
   - 開催済みイベントは破棄、新規イベント（c-mirai.jpのイベントURL付き）に置き換え。同日の既存イベントと重複するものは新しい方を採用

※ 画面側でも `isEventPast()` が閲覧時点の日付で開催済みイベントを自動で非表示にする。

## 2. 日程・入寮情報の再調査
- 現状把握: `node tools/gap_report.js`（都道府県別の穴・参考データ）、`node tools/dump_school.js <県名 or 学校ID>`
- 調査担当（エージェント）は **index.html を直接編集せず**、差分ファイル（JSON）を作る。形式は `tools/apply_patches.js` の冒頭コメント参照
  （`setStep` / `addStep` / `removeStep` / `setField` / `setEvents`）。日付・cycle・noteの変更には `evidence.url`（根拠URL）が必須。
- 検証: `node tools/apply_patches.js --dry <patch.json>`（何も書き込まない）。問題なければ `--dry` を外して適用。
- 方針: 令和9年度（2027年4月入学）の日付が確認できたステップは `cycle:"R9"`、`yearLabel` は削除。確認できない項目は変更しない（推測で埋めない）。
  塾・進学情報サイトのみが根拠の場合は `evidence.confidence:"secondary"` とし、noteに出典と「公式資料で要確認」を明記。
- 例年の公表時期の目安: 福井10月 / 宮崎「実施細目」10月上旬 / 山口県立大学附属周防大島 募集要項10月上旬 / 島根 各校募集要項11月以降 / 石川・香川 11月 / 北海道 学校別出願期間11月 / 各校の入寮審査案内 9〜12月

## 3. 仕上げ
- `index.html` の `DATA_UPDATED`（"YYYY-MM-DD"）を更新日に書き換える
- 構文確認: `node -e "require('./tools/lib.js').loadData()"`（学校数・ID重複もチェック）
- `git add index.html && git commit && git push origin main`（GitHub Pages へ反映）
- Artifact版: `index.html` を作業用ファイルに複製して Artifact として再公開（URLは既存を維持）
- 画面の確認: 志望校を3校ほど選び、イベント表示・日程表示・「結果をメールする」を確認

## 画面ロジックの要点（変更時の注意）
- ③時系列は `cycle` に `ref` を含む（前年度参考）ステップを除外する
- 併願の起点日は `firstMeaningfulStep`（最初に発表される結果）。二次募集の発表日は使わない
- 専願（`exclusive`）の早期選抜が後志望校の出願締切より前にある場合は `earlyConflictWarning` が警告
- メール本文は GoogleフォームのURLに載せるため `EMAIL_SUMMARY_MAX_LEN` と URL長ガードで短く保つ（長すぎると 400 エラー）
