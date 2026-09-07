"""Local preview with the same automatic news refresh as the hosted app."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import threading
import time
from update_news import OUTPUT, ROOT, update

lock = threading.Lock()
last_attempt = 0

def refresh_news():
    global last_attempt
    if not lock.acquire(blocking=False):
        return
    try:
        now = time.time()
        if now - last_attempt < 900:
            return
        last_attempt = now
        if not OUTPUT.exists() or now - OUTPUT.stat().st_mtime > 6 * 3600:
            try:
                update()
            except Exception as error:
                print(f'News: {error}; retaining cached headlines.', flush=True)
    finally:
        lock.release()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def do_GET(self):
        if self.path.split('?')[0] == '/news.json':
            # Serve cached data immediately while any due refresh happens in the background.
            threading.Thread(target=refresh_news, daemon=True).start()
        super().do_GET()

    def end_headers(self):
        if self.path.split('?')[0] == '/news.json':
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    threading.Thread(target=refresh_news, daemon=True).start()
    print(f'League preview: http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
