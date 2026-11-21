"""Read a pinned official source wheel; normal application builds stay offline.

Usage: python scripts/generate-platform-websites.py --wheel <downloaded wheel>
The archive is verified before import and is never installed into Python.
"""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, urlunsplit


def origin(value):
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        if (
            parsed.scheme not in ("http", "https")
            or parsed.username or parsed.password
            or parsed.port not in (None, 80, 443)
            or "." not in host
            or any(host == part or host.endswith("." + part) for part in (
                "example.com", "example.net", "example.org", "invalid", "local", "test", "onion",
            ))
        ):
            return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError:
            return "https://" + host + "/"
    except (TypeError, ValueError):
        return None


def patterns(cls):
    values = cls._VALID_URL
    return [re.compile(value) for value in (values if isinstance(values, (list, tuple)) else [values]) if isinstance(value, str)]


def tests(cls):
    return list(cls.get_testcases(include_onlymatching=True))


def canonical_options(options):
    # Prefer the site's own root only when that root is present in the source
    # examples too. Never strip an arbitrary number of hostname components.
    unique = list(dict.fromkeys(item["url"] for item in options))
    def host(url):
        return urlsplit(url).hostname.removeprefix("www.")
    roots = [url for url in unique if all(host(other) == host(url) or host(other).endswith("." + host(url)) for other in unique)]
    if roots:
        root = roots[0]
        return [next(item for item in options if item["url"] == root)]
    # www and bare host are equivalent here; unrelated brands remain choices.
    seen = set()
    result = []
    for option in options:
        key = host(option["url"])
        if key not in seen:
            seen.add(key)
            result.append(option)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    spec = json.loads((root / "scripts/platform-website-source.json").read_text(encoding="utf-8"))
    pinned = json.loads((root / "scripts/deps-versions.json").read_text(encoding="utf-8"))["yt-dlp"]["version"]
    catalog_path = root / "apps/ui/src/pages/platforms-page/engine-catalog.generated.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not spec["version"] == pinned == catalog["version"]:
        raise ValueError("Source, dependency pin and actual bundled catalog must use the same version")
    if hashlib.sha256(args.wheel.read_bytes()).hexdigest() != spec["sha256"]:
        raise ValueError("Official source archive checksum mismatch")
    os.environ["YTDLP_NO_LAZY_EXTRACTORS"] = "1"
    sys.path.insert(0, str(args.wheel.resolve()))
    from yt_dlp.extractor import gen_extractor_classes
    from yt_dlp.version import __version__
    if __version__ != spec["version"]:
        raise ValueError("Imported engine source version mismatch")
    classes = {(cls.IE_NAME or cls.ie_key()).lower(): cls for cls in gen_extractor_classes()}
    # The CLI prints names using an ASCII-safe console (español -> espaol).
    for name, cls in list(classes.items()):
        classes.setdefault(name.encode("ascii", "ignore").decode(), cls)
    rules, unavailable = {}, {}
    no_home = {"generic", "generic:quoted-html", "html5", "commonmistakes", "drm", "blob", "rtmp", "testurl", "unicodebom", "viewsource"}
    for entry in catalog["extractors"]:
        identifier = entry["id"]
        cls = classes.get(identifier.lower())
        if not cls:
            unavailable[identifier] = "unrecorded"
            continue
        regexes = patterns(cls)
        if identifier.lower() in no_home or not regexes or cls.__module__ == "yt_dlp.extractor.unsupported":
            unavailable[identifier] = "no-independent-site"
            continue
        options, arbitrary_host = [], False
        # Missing tests may be inherited safely only when this rule's own URL
        # pattern accepts that exact source example. A shared module is not proof.
        for owner in cls.__mro__:
            if not hasattr(owner, "get_testcases"):
                continue
            for item in tests(owner):
                value = item.get("url", "")
                website = origin(value)
                matching = [regex for regex in regexes if website and regex.match(value)]
                if not matching:
                    continue
                parsed = urlsplit(value)
                unrelated = urlunsplit((parsed.scheme, "nyacatch.invalid", parsed.path, parsed.query, parsed.fragment))
                if any(regex.match(unrelated) for regex in matching):
                    arbitrary_host = True
                    continue
                module = owner.__module__.replace(".", "/") + ".py"
                options.append({"url": website, "source": module})
            if options:
                break
        if options:
            rules[identifier] = canonical_options(options)
        else:
            unavailable[identifier] = "no-independent-site" if arbitrary_host else "unrecorded"
    # These navigation/search entry points use a pseudo URL or have no own
    # tests. Their explicit companion rule supplies the reviewed site address.
    companions = {
        "amazonminitv:season": "AmazonMiniTV", "amazonminitv:series": "AmazonMiniTV",
        "audius:track": "Audius", "dlive:stream": "dlive:vod",
        "ertflix:codename": "ertflix", "FOX9": "FOX9News", "francetv": "francetv:site",
        "HotStarPrefix": "hotstar", "nicovideo:search": "niconico", "nicovideo:search:date": "niconico",
        "player.sky.it": "video.sky.it", "prxseries:search": "PRXSeries", "prxstories:search": "PRXStory",
        "rokfin:search": "Rokfin", "rutube:movie": "rutube", "SangiinInstruction": "Sangiin",
        "SRGSSR": "SRGSSRPlay", "yahoo:search": "yahoo",
    }
    for identifier, parent in companions.items():
        if identifier not in unavailable or parent not in rules:
            raise ValueError("Companion rule changed; review its site association: " + identifier)
        rules[identifier] = [dict(option, viaRule=parent) for option in rules[parent]]
        del unavailable[identifier]
    # Internal protocols/embedded delivery do not identify a standalone source
    # website. Do not substitute the website of a random customer/test publisher.
    for identifier in ("9c9media", "Anvato", "ArcPublishing", "JStream", "mangomolo:live", "OnetMVP", "uplynk:preplay", "vhx:embed", "VoxMediaVolume"):
        if identifier in unavailable:
            unavailable[identifier] = "no-independent-site"
    result = {"schemaVersion": 1, "version": spec["version"], "source": spec, "rules": rules, "unavailable": unavailable}
    destination = root / "apps/ui/src/pages/platforms-page/engine-websites.generated.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"sourceRules": len(rules), "multipleSites": sum(len(options) > 1 for options in rules.values()), "unavailable": unavailable, "dest": str(destination)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
