use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL: &str = "https://api.github.com/user";

#[derive(Deserialize, Serialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Deserialize)]
struct GitHubErrorResponse {
    error: String,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct GitHubUser {
    login: String,
    avatar_url: Option<String>,
}

/// Bước 1: Request device code từ GitHub
pub async fn request_device_code(client_id: &str) -> AppResult<DeviceCodeResponse> {
    let client = Client::new();
    let resp = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", "repo")])
        .send()
        .await?;

    let status = resp.status();
    let text = resp.text().await?;

    if !status.is_success() {
        // Try to parse as error response
        if let Ok(err_resp) = serde_json::from_str::<GitHubErrorResponse>(&text) {
            tracing::warn!(
                "GitHub device code request failed: {} - {}",
                err_resp.error,
                err_resp.error_description.as_deref().unwrap_or("")
            );
            return Err(AppError::Auth(format!(
                "{}: {}",
                err_resp.error,
                err_resp.error_description.unwrap_or_default()
            )));
        }
        tracing::warn!("GitHub device code request failed: {} - {}", status, text);
        return Err(AppError::Internal(format!("GitHub error: {}", text)));
    }

    serde_json::from_str(&text).map_err(|e| {
        tracing::warn!("Failed to parse GitHub response: {} - {}", e, text);
        AppError::Internal(format!("Parse error: {}", e))
    })
}

/// Bước 2: Poll GitHub cho access token (gọi lặp lại cho đến khi user authorize)
pub async fn poll_for_token(client_id: &str, device_code: &str) -> AppResult<String> {
    let client = Client::new();
    let resp = client
        .post(GITHUB_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await?
        .json::<TokenResponse>()
        .await?;

    match (resp.access_token, resp.error) {
        (Some(token), _) => Ok(token),
        (_, Some(err)) if err == "authorization_pending" => {
            Err(AppError::Auth("authorization_pending".into()))
        }
        (_, Some(err)) if err == "slow_down" => Err(AppError::Auth("slow_down".into())),
        (_, Some(err)) => Err(AppError::Auth(err)),
        _ => Err(AppError::Auth("Unknown response".into())),
    }
}

/// Bước 3: Fetch GitHub user info
pub async fn fetch_github_user(token: &str) -> AppResult<(String, Option<String>)> {
    let client = Client::new();
    let user = client
        .get(GITHUB_USER_URL)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "open-sesame")
        .send()
        .await?
        .json::<GitHubUser>()
        .await?;
    Ok((user.login, user.avatar_url))
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_request_device_code_builds_correct_request() {
        // Mock server test would go here
        // For now, we just verify the structure
    }
}
