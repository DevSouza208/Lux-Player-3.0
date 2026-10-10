from typing import Literal

from pydantic import BaseModel, Field


class PlaylistUrlRequest(BaseModel):
    source_type: Literal["m3u", "xstream"]
    url: str | None = None
    server: str | None = None
    username: str | None = None
    password: str | None = None
    playlist_name: str | None = None


class PlaylistItem(BaseModel):
    id: str
    title: str
    stream_url: str
    kind: Literal["live", "movie", "series"]
    group: str = ""
    logo: str | None = None
    poster: str | None = None
    season: int | None = None
    episode: int | None = None
    description: str | None = None
    container_extension: str | None = None


class PlaylistParseResult(BaseModel):
    playlist_name: str
    source_type: Literal["m3u", "xstream"]
    items: list[PlaylistItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)