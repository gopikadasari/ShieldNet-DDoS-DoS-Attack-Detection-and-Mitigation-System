
from sqlalchemy import Column, Integer, String, Text
from ..database import Base


# ORM model for storing each mitigation decision the risk engine makes.
class Decision(Base):
    __tablename__ = "decisions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(255), index=True)
    action = Column(String(50))
    risk = Column(String(50))
    detail = Column(Text)
    created_at = Column(String(50))
