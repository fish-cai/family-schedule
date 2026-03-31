from pydantic import BaseModel, Field


class ParseEventRequest(BaseModel):
    text: str = Field(min_length=2, max_length=500)
