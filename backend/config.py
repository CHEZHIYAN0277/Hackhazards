from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["anthropic", "mistral"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    llm_provider: LLMProvider = "anthropic"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    mistral_api_key: str = ""
    mistral_model: str = "codestral-latest"
    redis_url: str = "redis://localhost:6379/0"
    github_token: str = ""
    github_repo_owner: str = ""
    github_repo_name: str = "vulnapi"
    github_dry_run: bool = True
    stub_mode: bool = True
    max_retries: int = 3
    state_ttl_seconds: int = 604800  # 7 days
    mutmut_timeout_seconds: int = 60
    default_criticality: float = 0.4

    role_confidence_threshold: float = 0.85
    role_high_confidence_threshold: float = 0.95
    sig_cache_enabled: bool = True
    sig_cache_ttl_seconds: int = 604800
    sig_cache_key_version: str = "v1"
    always_llm_filenames: str = ""

    # ── Render Workflow integration ──────────────────────────────────
    use_render_workflows: bool = False
    render_api_key: str = ""
    render_workflow_slug: str = "sentinel-workflow/run_pipeline"

    def llm_configured(self) -> bool:
        if self.llm_provider == "mistral":
            return bool(self.mistral_api_key)
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
