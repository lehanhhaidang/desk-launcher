use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct GitHubRepo {
    pub full_name: String,
    pub clone_url: String,
    pub html_url: String,
    pub private: bool,
}

#[derive(Serialize)]
struct CreateRepoRequest {
    name: String,
    description: String,
    private: bool,
    auto_init: bool,
}

/// Tạo repo mới trên GitHub
pub async fn create_github_repo(
    token: &str,
    name: &str,
    description: &str,
    private: bool,
) -> AppResult<GitHubRepo> {
    let client = Client::new();
    let resp = client
        .post("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "open-sesame")
        .json(&CreateRepoRequest {
            name: name.into(),
            description: description.into(),
            private,
            auto_init: false,
        })
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Provider(format!("GitHub API error: {body}")));
    }

    let repo = resp.json::<GitHubRepo>().await?;
    Ok(repo)
}

/// List repos (cho user chọn link existing)
pub async fn list_github_repos(
    token: &str,
    page: u32,
    per_page: u32,
) -> AppResult<Vec<GitHubRepo>> {
    let client = Client::new();
    let resp = client
        .get("https://api.github.com/user/repos")
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "open-sesame")
        .query(&[
            ("sort", "updated"),
            ("per_page", &per_page.to_string()),
            ("page", &page.to_string()),
        ])
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Provider(format!("GitHub API error: {body}")));
    }

    let repos = resp.json::<Vec<GitHubRepo>>().await?;
    Ok(repos)
}
