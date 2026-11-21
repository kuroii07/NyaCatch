"""Unit coverage for the small adapter; real executable coverage is in outputs/."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest


class BaseExtractor:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__()

    def _extract_product_media(self, media):
        return {'id': 'original-id', 'formats': ['original-video-format']}


module = types.ModuleType('yt_dlp.extractor.instagram')
module.InstagramIE = BaseExtractor
sys.modules['yt_dlp.extractor.instagram'] = module
source = Path(__file__).resolve().parents[3] / 'plugins/nyacatch/yt_dlp_plugins/extractor/nyacatch_instagram.py'
spec = importlib.util.spec_from_file_location('photo_adapter', source)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class OriginalPhotoTests(unittest.TestCase):
    def test_original_resolution_and_identity(self):
        media = {'pk': '123_owner', 'media_type': 1, 'image_versions2': {'candidates': [
            {'width': 320, 'url': 'https://s.cdninstagram.com/small.jpg'},
            {'width': 2048, 'url': 'https://s.cdninstagram.com/original.jpg?expiry=1'}]}}
        result = adapter._NyaCatchInstagramIE()._extract_product_media(media)
        self.assertEqual(result['_nyacatch_kind'], 'image')
        self.assertEqual(result['_nyacatch_resource_id'], 'ig-123')
        self.assertIn('/original.jpg', result['url'])
        self.assertEqual(result['id'], 'original-id')

    def test_missing_video_is_not_enough_to_infer_photo(self):
        self.assertIsNone(adapter._original_photo({'media_type': 2, 'image_versions2': {'candidates': [
            {'width': 2048, 'url': 'https://s.cdninstagram.com/cover.jpg'}]}}))
        self.assertEqual(adapter._NyaCatchInstagramIE()._extract_product_media({'media_type': 2})['formats'], ['original-video-format'])

    def test_source_domain_and_identity(self):
        for url in ['https://s.cdninstagram.com.evil.test/image.jpg', 'http://127.0.0.1/image.jpg', 'https://user:pass@s.cdninstagram.com/image.jpg']:
            self.assertIsNone(adapter._original_photo({'pk': '123', 'media_type': 1, 'image_versions2': {'candidates': [{'width': 1000, 'url': url}]}}))


if __name__ == '__main__':
    unittest.main()
