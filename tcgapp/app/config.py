from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    justtcg_api_key: str = ""
    database_url: str = "postgresql://tcgapp:tcgapp@localhost:5432/tcgapp"
    secret_key: str = "change-me"

    class Config:
        env_file = ".env"


settings = Settings()
