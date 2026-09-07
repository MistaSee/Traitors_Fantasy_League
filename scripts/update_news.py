"""Fetch current UK Celebrity Traitors headlines using public RSS; no API key."""
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
import html
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'web' / 'news.json'
FEED = 'https://news.google.com/rss/search?' + urlencode({
    'q': '"Celebrity Traitors" ("series 2" OR "season 2" OR "2026") when:30d',
    'hl': 'en-GB', 'gl': 'GB', 'ceid': 'GB:en',
})
PUBLISHERS = {
    'bbc.com', 'bbc.co.uk', 'theguardian.com', 'radiotimes.com',
    'digitalspy.com', 'itv.com', 'news.sky.com', 'independent.co.uk',
    'deadline.com', 'telegraph.co.uk', 'scotsman.com', 'standard.co.uk',
    'goodhousekeeping.com', 'cosmopolitan.com', 'esquire.com',
    'heart.co.uk', 'capitalxtra.com', 'womanandhome.com',
}

def clean(text):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', html.unescape(text or ''))).strip()

def topic(title):
    """Avoid filling the ticker with six outlets reporting the same announcement."""
    if re.search(r'everything.{0,30}need to know|is back!', title, re.I):
        return 'season-guide'
    if re.search(r'\b(launch|premiere|release|start)\b.{0,18}\bdate\b|when.{0,50}start|premiere date', title, re.I):
        return 'launch-date'
    if re.search(r'first.look|\btrailer\b|\bteaser\b', title, re.I):
        return 'first-look'
    if re.search(r'\bcast\b|line.up', title, re.I):
        return 'cast'
    return None

def stories_from_rss(raw, now):
    channel = ET.fromstring(raw).find('channel')
    if channel is None:
        raise ValueError('Response is not an RSS news feed')
    candidates = []
    for item in channel.findall('item'):
        source = item.find('source')
        if source is None:
            continue
        domain = (urlparse(source.get('url', '')).hostname or '').removeprefix('www.')
        if domain not in PUBLISHERS:
            continue
        title, publisher = clean(item.findtext('title')), clean(source.text)
        title = title.removesuffix(' - ' + publisher)
        if not re.search(r'celebrity\s+traitors', title, re.I):
            continue
        if re.search(r'\bawards?\b', title, re.I) and not re.search(r'(series|season)\s*(2|two)\b', title, re.I):
            continue
        if re.search(r'\b(US|USA|Australia|Australian)\b', title):
            continue
        url = item.findtext('link', '').strip()
        parsed = urlparse(url)
        # Feed links are Google News article redirects, never arbitrary URL schemes.
        if parsed.scheme != 'https' or parsed.hostname != 'news.google.com' or not parsed.path.startswith('/rss/articles/'):
            continue
        try:
            published = parsedate_to_datetime(item.findtext('pubDate', '')).astimezone(timezone.utc)
        except (ValueError, TypeError, OverflowError):
            continue
        if not now - timedelta(days=30) <= published <= now:
            continue
        candidates.append({'title': title[:220], 'url': url, 'source': publisher,
                           'publishedAt': published.isoformat()})
    candidates.sort(key=lambda item: item['publishedAt'], reverse=True)
    chosen, domains, topics = [], set(), set()
    for story in candidates:
        if story['source'] in domains:
            continue
        subject = topic(story['title'])
        if subject and subject in topics:
            continue
        if any(story['url'] == other['url'] or SequenceMatcher(None, story['title'].lower(), other['title'].lower()).ratio() > .78 for other in chosen):
            continue
        chosen.append(story)
        domains.add(story['source'])
        if subject:
            topics.add(subject)
        if len(chosen) == 6:
            break
    return chosen

def update():
    now = datetime.now(timezone.utc)
    request = Request(FEED, headers={'User-Agent': 'RoundTableFantasy/1.0 (RSS headlines)', 'Accept': 'application/rss+xml, application/xml'})
    with urlopen(request, timeout=25) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('RSS response is unexpectedly large')
    stories = stories_from_rss(raw, now)
    # An empty feed can be a transient outage. Preserve the previous headlines.
    if not stories:
        raise ValueError('No matching headlines; keeping the previous news snapshot')
    payload = {'checkedAt': now.isoformat(), 'feed': 'Google News RSS', 'stories': stories}
    temporary = OUTPUT.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    return payload

if __name__ == '__main__':
    try:
        result = update()
        print(f"Updated {len(result['stories'])} headlines at {result['checkedAt']}")
        for story in result['stories']:
            print(f"  {story['source']}: {story['title']}")
    except Exception as error:
        print(f'News update failed: {error}', file=sys.stderr)
        sys.exit(1)
