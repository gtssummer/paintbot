from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timedelta
import os

DB_PATH = os.environ.get("DB_PATH", "paint.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class Drawing(Base):
    __tablename__ = "drawings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    username = Column(String, nullable=True)
    file_path = Column(String)
    brush = Column(String, nullable=True)
    size = Column(Integer, nullable=True)
    color = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

os.makedirs("storage", exist_ok=True)
Base.metadata.create_all(bind=engine)

def save_drawing(user_id: int, username: str | None, file_path: str, brush: str | None, size: int | None, color: str | None) -> int:
    with SessionLocal() as db:
        d = Drawing(user_id=user_id, username=username, file_path=file_path, brush=brush, size=size, color=color)
        db.add(d)
        db.commit()
        db.refresh(d)
        return d.id

def list_drawings(user_id: int, limit: int = 3):
    with SessionLocal() as db:
        return db.query(Drawing).filter(Drawing.user_id == user_id).order_by(Drawing.created_at.desc()).limit(limit).all()

def list_all_drawings(limit: int = 100):
    with SessionLocal() as db:
        return db.query(Drawing).order_by(Drawing.created_at.desc()).limit(limit).all()

def delete_drawing_by_id(d_id: int):
    with SessionLocal() as db:
        obj = db.get(Drawing, d_id)
        if not obj:
            return False
        try:
            if os.path.exists(obj.file_path):
                os.remove(obj.file_path)
        except Exception:
            pass
        db.delete(obj)
        db.commit()
        return True

def cleanup_old_drawings(days: int = 10):
    threshold = datetime.utcnow() - timedelta(days=days)
    with SessionLocal() as db:
        old = db.query(Drawing).filter(Drawing.created_at < threshold).all()
        for row in old:
            try:
                if os.path.exists(row.file_path):
                    os.remove(row.file_path)
            except Exception:
                pass
            db.delete(row)
        db.commit()
