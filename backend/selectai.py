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
            "how many students are there",
            "give me name, email & manageres nae of students that have not yet acknowledegde the workshop",
            "ofr each onboarding step, give me teh step detail and number of students that have completed it ",
            "how many test users are there ?",
            "who are the admins",
            "how many studensta have 2TL info filled",
        ]

        print("\nRunning example queries...\n")

        separator = "-" * 40
        for query in queries:
            print(separator)
            print(f"Query: {query}")
            try:
                try:
                    sql_text = profile.show_sql(prompt=query)
                    if sql_text:
                        print("SQL:")
                        print(sql_text)
                        print(separator)
                except Exception as sql_exc:
                    print(f"Could not generate SQL: {sql_exc}")
                df = profile.run_sql(prompt=query)
                print(f"Columns: {list(df.columns)}")
                print(f"Results: {len(df)} rows")
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
