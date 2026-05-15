use crate::db::account_repo;
use crate::error::AppResult;
use crate::models::account::{Account, ProviderType};
use crate::services::auth_service;
use crate::state::AppState;
use crate::utils::secret_store;

const GITHUB_CLIENT_ID: &str = "Ov23liXpvIzZVT9rMcg6"; // Config via env or tauri.conf.json

/// Frontend gọi: nhận device code + user code + verification URL
#[tauri::command]
pub async fn auth_github_start() -> AppResult<auth_service::DeviceCodeResponse> {
    auth_service::request_device_code(GITHUB_CLIENT_ID).await
}

/// Frontend gọi lặp lại (polling): trả về Account khi thành công
#[tauri::command]
pub async fn auth_github_poll(
    state: tauri::State<'_, AppState>,
    device_code: String,
) -> AppResult<Account> {
    // Poll for token
    let token = auth_service::poll_for_token(GITHUB_CLIENT_ID, &device_code).await?;

    // Fetch user info
    let (username, avatar_url) = auth_service::fetch_github_user(&token).await?;

    // Create account
    let now = chrono::Utc::now();
    let id = uuid::Uuid::new_v4().to_string();
    let provider = ProviderType::Github;
    let token_ref = secret_store::store_account_token(&provider, &id, &token)?;

    let account = Account {
        id,
        provider,
        username,
        token: token_ref,
        refresh_token: None,
        avatar_url,
        is_default: true,
        created_at: now,
        updated_at: now,
    };

    // Save to DB
    let db = state.db.lock().await;
    account_repo::insert(&db, &account)?;

    Ok(account)
}

/// Lấy danh sách accounts đã đăng nhập
#[tauri::command]
pub async fn auth_list_accounts(state: tauri::State<'_, AppState>) -> AppResult<Vec<Account>> {
    let db = state.db.lock().await;
    account_repo::list_all(&db)
}

/// Logout: xoá account
#[tauri::command]
pub async fn auth_logout(state: tauri::State<'_, AppState>, account_id: String) -> AppResult<()> {
    let db = state.db.lock().await;
    if let Some(account) = account_repo::find_by_id(&db, &account_id)? {
        secret_store::delete_stored_token(&account.token)?;
    }
    account_repo::delete(&db, &account_id)
}
