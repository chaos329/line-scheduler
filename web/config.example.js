// コピーして web/config.js を作成(config.js は .gitignore 済み)。
// anon key は公開前提のキーですが、RLS で読み取り専用に絞っています。service_role キーは絶対に入れないでください。
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
};
