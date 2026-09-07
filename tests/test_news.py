from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from update_news import stories_from_rss

NOW = datetime(2026, 9, 7, tzinfo=timezone.utc)

def item(title='Celebrity Traitors season 2 trailer', source='BBC', domain='https://www.bbc.com', link='https://news.google.com/rss/articles/one', date='Sun, 06 Sep 2026 10:00:00 GMT'):
    return f'<item><title>{escape(title)} - {source}</title><source url="{domain}">{source}</source><link>{escape(link)}</link><pubDate>{date}</pubDate></item>'

def parse(*items):
    return stories_from_rss(('<rss><channel>'+''.join(items)+'</channel></rss>').encode(), NOW)

class NewsTests(unittest.TestCase):
    def test_cleans_and_attributes_headline(self):
        news = parse(item())[0]
        self.assertEqual(news['title'], 'Celebrity Traitors season 2 trailer')
        self.assertEqual(news['source'], 'BBC')

    def test_ignores_untrusted_irrelevant_old_and_future_items(self):
        self.assertEqual(parse(item(domain='https://bbc.com.evil.example'), item(title='The Traitors US season 2'), item(link='javascript:alert(1)'), item(date='Thu, 01 Jan 2026 10:00:00 GMT'), item(date='Tue, 08 Sep 2026 10:00:00 GMT')), [])

    def test_deduplicates_and_limits_each_publisher(self):
        self.assertEqual(len(parse(item(), item(link='https://news.google.com/rss/articles/two'), item(title='Celebrity Traitors season 2 cast', link='https://news.google.com/rss/articles/three'))), 1)

    def test_sorts_by_publication(self):
        result = parse(item(date='Sat, 05 Sep 2026 10:00:00 GMT'), item(title='Celebrity Traitors premiere date revealed', source='The Guardian', domain='https://www.theguardian.com', link='https://news.google.com/rss/articles/new'))
        self.assertEqual(result[0]['source'], 'The Guardian')

    def test_rejects_non_rss(self):
        with self.assertRaises(ValueError): stories_from_rss(b'<html/>', NOW)

    def test_clusters_launch_date_reports_from_different_publishers(self):
        result = parse(item(title='Richard Osman lets slip Celebrity Traitors season 2 launch date'), item(title='Richard Osman appears to reveal Celebrity Traitors premiere date', source='Deadline', domain='https://deadline.com', link='https://news.google.com/rss/articles/new'))
        self.assertEqual(len(result), 1)

if __name__ == '__main__': unittest.main()
