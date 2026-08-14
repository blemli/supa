#!/usr/bin/env python3
"""dritte shim: run the upstream cmd, tee its stdout to logli (UDP 5514, RFC5424 + HMAC).
lossy by design - logli down = lines gone, app unbothered. usage: dritte.py -- <upstream cmd...>"""
import datetime, hashlib, hmac, os, re, signal, socket, subprocess, sys

APP = os.environ.get("DRITTE_APP", "dritte")
SECRET = os.environ.get("LOGLI_SECRET", "")
ADDR = (os.environ.get("LOGLI_HOST", "logli"), int(os.environ.get("LOGLI_PORT", "5514")))
ENV = os.environ.get("APP_ENV", "production")
V = os.environ.get("KAMAL_VERSION", "")
SEV = [(re.compile(p, re.I), s) for p, s in [  # first match wins, default info - sniffed, not parsed: upstream formats vary
    (r"emerg|fatal|panic", 2), (r"error|exception|traceback|\berr\b", 3), (r"\bwarn", 4), (r"\bdebug\b|\btrace\b", 7)]]
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)


def ship(line):
    if not (SECRET and line):
        return
    lvl = next((s for rx, s in SEV if rx.search(line[:200])), 6)
    ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
    body = f'<{128 + lvl}>1 {ts} - {APP} - - [l env="{ENV}" file="" line="" v="{V}" c=""] {line}'
    sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()[:32]
    try:
        sock.sendto(f"{body} sig={sig}".encode(), ADDR)
    except OSError:
        pass


cmd = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", bufsize=1)
for s in (signal.SIGTERM, signal.SIGINT):
    signal.signal(s, lambda n, f: p.send_signal(n))  # we are pid 1 - docker stop must reach the app
ship("boot " + " ".join(cmd))
for line in p.stdout:
    print(line, end="", flush=True)  # kamal app logs keeps everything
    ship(line.rstrip("\n"))
sys.exit(p.wait())
