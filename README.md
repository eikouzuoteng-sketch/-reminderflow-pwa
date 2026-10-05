# ReminderFlow PWA v0.2.1

GitHub Pages 向けの再署名不要テスト版です。

## 公開方法

1. GitHubで **Public** リポジトリを作成します（例: `reminderflow-pwa`）。
2. このフォルダの中身をリポジトリの `main` ブランチ直下へアップロードします。
3. GitHubの **Settings → Pages** を開きます。
4. **Build and deployment → Source** を `Deploy from a branch` にします。
5. Branch を `main`、Folder を `/(root)` にして **Save** します。
6. 公開されたURLをiPhoneのSafariで開き、共有メニュー → **ホーム画面に追加** → **Webアプリとして開く** をONにします。

## 注意

- タスクデータは端末側のブラウザ領域に保存され、GitHubにはアップロードされません。
- GitHub Pages上のソースコードはPublicリポジトリの場合は公開されます。
- iOSでアプリを閉じた状態の時刻指定通知には、別途Web Pushサーバーが必要です。
- 重要なタスクは設定画面のJSONバックアップを定期的に保存してください。
