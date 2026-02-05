"""
Configuration settings for the workshop survey application using YAML.
"""
import os
from typing import Optional

from envyaml import EnvYAML

try:  # Ensure .env values populate os.environ before YAML is parsed
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


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
                'app': {
                    'debug': os.getenv('DEBUG', 'false').lower() == 'true',
                    'secret_key': os.getenv('SECRET_KEY', 'your-secret-key-change-in-production'),
                }
            }

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
    def oracle_select_ai_profile(self) -> str:
        return self._config.get('database', {}).get('select_ai_profile', 'oci_ai_profile')

    @property
    def debug(self) -> bool:
        return self._config.get('app', {}).get('debug', False)

    @property
    def secret_key(self) -> str:
        return self._config.get('app', {}).get('secret_key', 'your-secret-key-change-in-production')

    @property
    def proxy_enabled(self) -> bool:
        value = self._config.get('proxy', {}).get('enabled', os.getenv('PROXY_ENABLED', 'false'))
        return str(value).lower() == 'true'

    @property
    def proxy_prefix(self) -> str:
        return self._config.get('proxy', {}).get('prefix', os.getenv('PROXY_PREFIX', ''))

    @property
    def proxy_bearer_token(self) -> str:
        return self._config.get('proxy', {}).get('bearer_token', os.getenv('PROXY_BEARER_TOKEN', ''))

    @property
    def static_dir(self) -> str:
        return os.path.join(os.path.dirname(__file__), "static")

    @property
    def images_dir(self) -> str:
        return os.path.join(self.static_dir, "images")

    @property
    def admin_shared_password(self) -> str:
        return self._config.get('admin', {}).get('shared_password', os.getenv('ADMIN_SHARED_PASSWORD', 'change-me'))

    @property
    def ignore_test_users(self) -> bool:
        value = self._config.get('admin', {}).get('ignore_test_users', os.getenv('IGNORE_TEST_USERS', 'true'))
        return str(value).lower() != 'false'

    @property
    def reset_schema_on_startup(self) -> bool:
        value = self._config.get('app', {}).get('reset_schema_on_startup', os.getenv('RESET_SCHEMA_ON_STARTUP', 'false'))
        if isinstance(value, str) and ':' in value:
            # Handle EnvYAML default syntax like "True:false"
            value = value.split(':', 1)[0]
        return str(value).lower() == 'true'

    @property
    def reset_data_on_startup(self) -> bool:
        value = self._config.get('app', {}).get('reset_data_on_startup', os.getenv('RESET_DATA_ON_STARTUP', 'false'))
        if isinstance(value, str) and ':' in value:
            # Handle EnvYAML default syntax like "True:false"
            value = value.split(':', 1)[0]
        return str(value).lower() == 'true'

    @property
    def page_sections(self) -> dict:
        return self._config.get('page_sections', {})


# Global config instance
config = Config()
