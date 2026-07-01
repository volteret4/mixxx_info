from datetime import datetime

from sqlalchemy import create_engine, Column, String, Integer, Float, JSON, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Session, relationship


class Base(DeclarativeBase):
    pass


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True)

    # Core
    title = Column(String)
    artist = Column(String)
    album = Column(String)
    label = Column(String)
    year = Column(String)

    # Local metadata
    file_path = Column(String, unique=True, nullable=False)
    folder_taste = Column(String)

    # Audio technical info (especially relevant for FLAC)
    duration = Column(Float)       # seconds
    sample_rate = Column(Integer)  # Hz, e.g. 44100, 48000, 96000
    bit_depth = Column(Integer)    # 16 or 24
    channels = Column(Integer)
    bpm = Column(Float)
    key_signature = Column(String) # e.g. "Am", "F#", Mixxx/Rekordbox style

    # Credits (lists of strings)
    producers = Column(JSON)
    engineers = Column(JSON)
    session_musicians = Column(JSON)

    # Sample genealogy (list of {artist, title})
    samples = Column(JSON)
    sampled_by = Column(JSON)

    # Metrics
    lastfm_listeners = Column(Integer)

    # User custom tags (parsed from the comment/description tag field, space-separated)
    custom_tags = Column(JSON)

    # MusicBrainz enrichment
    isrc = Column(String)
    release_type = Column(String)     # Album, Single, EP, Broadcast, …
    release_status = Column(String)   # Official, Promotion, Bootleg
    release_country = Column(String)
    catalog_number = Column(String)
    mb_tags = Column(JSON)            # recording-level user tags from MB (sorted by vote count)
    artist_mb_tags = Column(JSON)     # main artist's tags from MB artist-credit

    # External IDs
    musicbrainz_id = Column(String)          # recording MBID
    musicbrainz_release_id = Column(String)  # release MBID (needed for Cover Art Archive)
    discogs_release_id = Column(String)

    # Wikipedia (artist-level and album-level)
    artist_wikipedia_url = Column(String)
    artist_wikipedia_content = Column(Text)
    album_wikipedia_url = Column(String)

    # Cover art
    cover_art_path = Column(String)   # local relative path under covers/
    cover_art_url = Column(String)    # original source URL

    # Critic scores — Metacritic
    metacritic_url = Column(String)
    metacritic_score = Column(Integer)
    metacritic_num_critics = Column(Integer)
    metacritic_positive = Column(Integer)
    metacritic_mixed = Column(Integer)
    metacritic_negative = Column(Integer)

    # Critic scores — Album of the Year
    aoty_url = Column(String)
    aoty_critic_score = Column(Integer)
    aoty_user_score = Column(Integer)
    aoty_score = Column(Float)          # alias for aoty_critic_score, kept for query compat
    aoty_num_critic_ratings = Column(Integer)
    aoty_num_user_ratings = Column(Integer)

    # Review links from other publications (list of {source, url, title})
    review_links = Column(JSON)

    # Streaming / platform links
    youtube_url = Column(String)
    bandcamp_url = Column(String)

    # Artist profile from Discogs
    artist_profile = Column(Text)
    artist_real_name = Column(String)
    artist_aliases = Column(JSON)

    # AI enrichment
    gemini_context = Column(Text)  # JSON: {historical_context, main_sample_context, production_notes}
    gemini_sources = Column(JSON)  # list of URLs

    # Fingerprint (raw AcoustID fingerprint string)
    acoustid_fingerprint = Column(Text)


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())
    tracks = relationship(
        "PlaylistTrack",
        back_populates="playlist",
        order_by="PlaylistTrack.position",
        cascade="all, delete-orphan",
    )


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id"), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    playlist = relationship("Playlist", back_populates="tracks")
    song = relationship("Song")


def get_engine(db_url: str = "sqlite:///library.db"):
    return create_engine(db_url)


def init_db(engine):
    Base.metadata.create_all(engine)
    _migrate(engine)


def _migrate(engine):
    """Add columns that exist in the model but are missing from the live table."""
    import sqlalchemy as sa

    col_type_map = {
        col.key: col.type.compile(engine.dialect)
        for col in Song.__table__.columns
        if col.key != "id"
    }
    with engine.connect() as conn:
        existing = {row[1] for row in conn.execute(sa.text("PRAGMA table_info(songs)"))}
        for col_name, col_type in col_type_map.items():
            if col_name not in existing:
                conn.execute(sa.text(f"ALTER TABLE songs ADD COLUMN {col_name} {col_type}"))
        conn.commit()


def upsert_song(session: Session, data: dict) -> Song:
    song = session.query(Song).filter_by(file_path=data["file_path"]).first()
    if not song:
        song = Song()
        session.add(song)
    for key, val in data.items():
        if hasattr(Song, key) and val is not None:
            setattr(song, key, val)
    session.flush()
    return song
