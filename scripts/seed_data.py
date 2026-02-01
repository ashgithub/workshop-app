"""
Seed script for workshop surveys and tasks.
"""
from backend.database import db

db.seed_survey_templates()
db.seed_survey_questions()
db.seed_onboarding_tasks()
print("Seeding completed.")