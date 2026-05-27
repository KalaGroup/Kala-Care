from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, text
from app.database import Base

class EmployeeQuery(Base):
    __tablename__ = "employee_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(50), nullable=False, index=True)
    user_name = Column(String(100), nullable=False)
    subject = Column(String(200), nullable=False)
    query = Column(Text, nullable=False)

    # Store IST time from SQL Server
    created_at = Column(DateTime(timezone=True), server_default=text("GETDATE()"))

    is_resolved = Column(Boolean, default=False)
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "subject": self.subject,
            "query": self.query,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "is_resolved": self.is_resolved
        }