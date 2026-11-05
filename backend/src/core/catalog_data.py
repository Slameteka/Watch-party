"""Default curated Creative Commons movie catalog (Blender open movies)."""

from core.config import APP_URL
from core.models.room import Media

DEFAULT_CATALOG_ITEMS: list[Media] = [
    Media(
        media_id="sintel",
        title="Sintel",
        description="A lonely young woman, Sintel, helps and befriends a baby dragon she calls Scales.",
        duration_sec=888.0,
        poster_url=f"{APP_URL}/posters/sintel.jpg",
        playback_url=f"{APP_URL}/media/sintel/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright Blender Foundation | durian.blender.org",
    ),
    Media(
        media_id="big-buck-bunny",
        title="Big Buck Bunny",
        description="A large and lovable rabbit deals with bullying forest creatures in this classic open animation.",
        duration_sec=596.0,
        poster_url=f"{APP_URL}/posters/big-buck-bunny.jpg",
        playback_url=f"{APP_URL}/media/big-buck-bunny/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org",
    ),
    Media(
        media_id="tears-of-steel",
        title="Tears of Steel",
        description="Set in a dystopian future, a group of warriors and scientists gather at the Oude Kerk in Amsterdam.",
        duration_sec=734.0,
        poster_url=f"{APP_URL}/posters/tears-of-steel.jpg",
        playback_url=f"{APP_URL}/media/tears-of-steel/master.m3u8",
        license="CC BY 3.0",
        attribution="(c) copyright Blender Foundation | mango.blender.org",
    ),
]
