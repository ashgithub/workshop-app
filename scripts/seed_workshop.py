"""
Seed script for workshop surveys, tasks, and game logs.
Run with: uv run python scripts/seed_workshop.py
"""
from backend.database import db

db.seed_survey_templates()
db.seed_survey_questions()
db.seed_onboarding_tasks()
db.seed_game_logs()
print("Seeding completed.")