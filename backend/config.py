"""
Configuration settings for the workshop survey application using YAML.
"""
import os
from envyaml import EnvYAML
from typing import Optional


class Config:
    """Application configuration loaded from config.yaml and environment variables."""

    def __init__(self, config_file: str = "config.yaml"):
        # Load YAML config
        if os.path.exists(config_file):
            self._config = EnvYAML(config_file, strict=False)
        else:
            # Default configuration
            self._config = {
                'database': {
                    'user': os.getenv('ORACLE_USER', ''),
                    'password': os.getenv('ORACLE_PASSWORD', ''),
                    'dsn': os.getenv('ORACLE_DSN', ''),
                },
                'openai': {
                    'api_key': os.getenv('OPENAI_API_KEY', ''),
                    'base_url': os.getenv('OPENAI_BASE_URL'),
                },
                'app': {
                    'debug': os.getenv('DEBUG', 'false').lower() == 'true',
                    'secret_key': os.getenv('SECRET_KEY', 'your-secret-key-change-in-production'),
                }
            }

    @property
    def oracle_wallet_pass(self) -> str:
        return self._config.get('database', {}).get('wallet_pass', '')
    @property
    def oracle_wallet(self) -> str:
        return self._config.get('database', {}).get('wallet', '')
    @property
    def oracle_user(self) -> str:
        return self._config.get('database', {}).get('user', '')

    @property
    def oracle_password(self) -> str:
        return self._config.get('database', {}).get('password', '')

    @property
    def oracle_dsn(self) -> str:
        return self._config.get('database', {}).get('dsn', '')

    @property
    def oracle_wallet(self) -> Optional[str]:
        return self._config.get('database', {}).get('wallet')

    @property
    def oracle_wallet_pass(self) -> Optional[str]:
        return self._config.get('database', {}).get('wallet_pass')

    @property
    def openai_api_key(self) -> str:
        return self._config.get('openai', {}).get('api_key', '')

    @property
    def openai_base_url(self) -> Optional[str]:
        return self._config.get('openai', {}).get('base_url')

    @property
    def debug(self) -> bool:
        return self._config.get('app', {}).get('debug', False)

    @property
    def secret_key(self) -> str:
        return self._config.get('app', {}).get('secret_key', 'your-secret-key-change-in-production')

    @property
    def static_dir(self) -> str:
        return os.path.join(os.path.dirname(__file__), "static")

    @property
    def images_dir(self) -> str:
        return os.path.join(self.static_dir, "images")


# Global config instance
config = Config()
