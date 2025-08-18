from pydantic import BaseModel
from typing import Optional

class UploadRequest(BaseModel):
    image_data: str  # dataURL вида "data:image/png;base64,...."
    brush: Optional[str] = None
    size: Optional[int] = None
    color: Optional[str] = None

class UploadResponse(BaseModel):
    ok: bool
    id: int
    url: str

class DrawingInfo(BaseModel):
    id: int
    user_id: int
    username: Optional[str]
    file_path: str