"""Preserve original photo entries from yt-dlp's existing Instagram extraction.

No browser cookies or separate platform API are used by this plugin. Video
extraction remains delegated to yt-dlp. NyaCatch validates CDN URLs again before
preview/download and determines an image's saved extension from its bytes.
"""
from urllib.parse import urlparse

from yt_dlp.extractor.instagram import InstagramIE as _InstagramIE


def _original_photo(media):
    # A missing video URL alone does not establish that an item is a photo.
    if media.get('media_type') != 1:
        return None
    candidates = media.get('image_versions2', {}).get('candidates') or []
    candidates = [c for c in candidates if isinstance(c, dict)
                  and isinstance(c.get('url'), str)]
    if not candidates:
        return None
    def width(candidate):
        try:
            return int(candidate.get('width') or 0)
        except (ValueError, TypeError):
            return 0
    candidate = max(candidates, key=width)
    try:
        parsed = urlparse(candidate['url'])
        valid = (parsed.scheme == 'https' and not parsed.username and not parsed.port
                 and parsed.hostname and (parsed.hostname.endswith('.cdninstagram.com')
                                         or parsed.hostname.endswith('.fbcdn.net')))
    except ValueError:
        valid = False
    if not valid:
        return None
    resource_id = str(media.get('pk') or '').split('_')[0]
    if not resource_id.isdigit():
        return None
    extension = parsed.path.rsplit('.', 1)[-1].lower()
    if extension not in ('jpg', 'jpeg', 'png', 'webp', 'gif'):
        extension = 'jpg'
    return {'_nyacatch_kind': 'image', '_nyacatch_resolver': 'instagram-public',
            '_nyacatch_resource_id': f'ig-{resource_id}',
            'url': candidate['url'], 'thumbnail': candidate['url'],
            'ext': extension, 'vcodec': 'none', 'acodec': 'none',
            'formats': [{'format_id': 'nyacatch-original-image',
                         'url': candidate['url'], 'ext': extension,
                         'vcodec': 'none', 'acodec': 'none'}]}


class _NyaCatchInstagramIE(_InstagramIE, plugin_name='nyacatch_originals'):
    def _extract_product_media(self, product_media):
        result = super()._extract_product_media(product_media)
        photo = _original_photo(product_media)
        return {**result, **photo} if photo else result
