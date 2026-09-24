import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


DIST_DIR = Path(__file__).resolve().parent / "dist"
os.chdir(DIST_DIR)


class SpaHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        request_path = self.path.split("?", 1)[0].split("#", 1)[0]
        fs_path = self.translate_path(request_path)
        if not request_path.startswith("/assets/") and not os.path.exists(fs_path):
            self.path = "/index.html"
        return super().send_head()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 5173), SpaHandler)
    server.serve_forever()
