from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Sentellent Agent"
    DEBUG: bool = False

    LLM_PROVIDER: str = "gemini"
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"

    DATABASE_URL: str = "postgresql+asyncpg://developer:postgres@localhost:5432/sentellent"

    GOOGLE_CLIENT_ID: str = ""
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 1440

    ALLOWED_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
