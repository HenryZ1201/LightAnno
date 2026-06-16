from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    dataset_root: Path = Field(default=Path("../data"), alias="LIGHTANNO_DATASET_ROOT")
    workspace_root: Path = Field(default=Path(".."), alias="LIGHTANNO_WORKSPACE_ROOT")
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="LIGHTANNO_CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(populate_by_name=True)

    @property
    def metadata_path(self) -> Path:
        return self.workspace_root / "metadata.json"

    @property
    def backup_path(self) -> Path:
        return self.workspace_root / "metadata.backup.json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
