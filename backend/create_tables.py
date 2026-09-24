
from app.database import engine, Base
from app.models import sql_models


# Utility script to create the logging tables used by the PIA‑Shield backend.
def main():
    print("Creating tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("Tables created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")


if __name__ == "__main__":
    main()
