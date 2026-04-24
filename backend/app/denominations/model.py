from typing import List, Optional
from sqlmodel import Field, Column, SQLModel
from sqlalchemy import JSON


class Denomination(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str
    regions: List[str] = Field(sa_column=Column(JSON, nullable=False))


class DenominationRead(SQLModel):
    id: int
    name: str
    type: str
    regions: List[str]
