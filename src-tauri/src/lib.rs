//! KERS Lab desktop shell: one window serving the bundled Vite build (`../dist`)
//! from the app's own origin. No custom commands, no external plugins.

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Runtime, Url};

/// True for URLs that belong to the app itself: the bundled assets
/// (`tauri://localhost`, `http(s)://tauri.localhost` on Windows) and the Vite
/// dev server used by `npm run desktop:dev`.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" => true,
        "http" | "https" => matches!(
            url.host_str(),
            Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1")
        ),
        _ => false,
    }
}

/// Keeps the main webview on the app: an external link (theory sources) must not
/// replace the offline app with a remote page. Inline hook, no extra crate.
fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("navigation-guard")
        .on_navigation(|_webview, url| is_app_url(url))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(navigation_guard())
        .run(tauri::generate_context!())
        .expect("error while running KERS Lab");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).expect("valid url")
    }

    #[test]
    fn allows_app_origins() {
        assert!(is_app_url(&url("tauri://localhost/index.html#/sim")));
        assert!(is_app_url(&url("http://tauri.localhost/assets/worker.js")));
        assert!(is_app_url(&url("http://localhost:5173/#/teoria")));
    }

    #[test]
    fn blocks_external_sites() {
        assert!(!is_app_url(&url("https://www.fia.com/")));
        assert!(!is_app_url(&url("https://example.org/tauri.localhost")));
        assert!(!is_app_url(&url("file:///C:/Windows/")));
    }
}
