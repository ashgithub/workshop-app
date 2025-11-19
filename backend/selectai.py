#!/usr/bin/env python3
"""
Oracle SELECT AI Demonstration for Student Profiles

This standalone application demonstrates Oracle's SELECT AI functionality
by running natural language queries on the STUDENTS table to showcase
student profile information.
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from config import config
import select_ai


def main():
    """Main demonstration function."""
    print("Oracle SELECT AI Demonstration - Student Profiles")
    print("=" * 50)

    try:
        # Connect to Oracle using existing database credentials
        print("Connecting to Oracle database...")
        select_ai.connect(
            user=config.oracle_user,
            password=config.oracle_password,
            dsn=config.oracle_dsn,
            config_dir=config.oracle_wallet,
            wallet_location=config.oracle_wallet,
            wallet_password=config.oracle_wallet_pass,
        )
        print("Connected successfully!")

        # Create AI profile
        print(f"\nCreating AI profile '{config.oracle_select_ai_profile}'...")
        profile = select_ai.Profile(profile_name=config.oracle_select_ai_profile)
        print("Profile created!")

        # Example queries demonstrating student profile capabilities
        queries = [
            "Show me all student profiles with their names and locations",
            "How many students are from Austin?",
            "List students who have completed their team introductions",
            "What are the different teams and how many students are in each?",
            "Show me students with their introduction text",
            "How many students have acknowledged the workshop?",
            "List students by location and show their team information"
        ]

        print("\nRunning example queries...\n")

        for i, query in enumerate(queries, 1):
            print(f"{i}. {query}")
            print("-" * 40)
            try:
                df = profile.run_sql(prompt=query)
                print(f"Columns: {list(df.columns)}")
                print(f"Results ({len(df)} rows):")
                print(df.to_string(index=False))
            except Exception as e:
                print(f"Error executing query: {e}")
            print("\n")

    except Exception as e:
        print(f"Error: {e}")
        print("Make sure Oracle credentials are configured in config.yaml")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
