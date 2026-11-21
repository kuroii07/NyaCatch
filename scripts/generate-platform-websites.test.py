import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("website_source", Path(__file__).with_name("generate-platform-websites.py"))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class WebsiteSourceTests(unittest.TestCase):
    def test_only_public_web_origins_survive(self):
        self.assertEqual(source.origin("https://news.example-site.com/watch?a=1#t"), "https://news.example-site.com/")
        for value in ["bad", "file:///C:/test", "custom:123", "https://user:password@site.com/", "http://127.0.0.1/file", "http://[::1]/file", "https://localhost/", "https://name.invalid/", "https://example.com/a", "https://sub.example.org/a", "https://site.onion/a", "https://site.com:8090/a"]:
            with self.subTest(value=value):
                self.assertIsNone(source.origin(value))

    def test_existing_parent_origin_is_preferred_without_guessing_a_domain(self):
        options = [{"url": "https://video.brand.com/", "source": "video.py"}, {"url": "https://www.brand.com/", "source": "site.py"}, {"url": "https://brand.com/", "source": "site.py"}]
        self.assertEqual(source.canonical_options(options), [options[1]])

    def test_unrelated_brands_and_subdomains_without_a_known_parent_stay_choices(self):
        for urls in [["https://a.brand.com/", "https://b.brand.com/"], ["https://www.brand-one.com/", "https://www.brand-two.com/"]]:
            options = [{"url": url, "source": "brands.py"} for url in urls]
            self.assertEqual(source.canonical_options(options), options)


if __name__ == "__main__":
    unittest.main()
