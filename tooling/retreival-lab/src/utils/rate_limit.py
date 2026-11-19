import time
from collections import defaultdict
from config import DEFAULT_DELAY_S

class RateLimiter:
    """Per-domain polite delay. No parallel bursts."""
    def __init__(self, default_delay: float = DEFAULT_DELAY_S):
        self.default_delay = default_delay
        self._last = defaultdict(float)
        self._delay = {}

    def set_delay(self, domain: str, seconds: float):
        if seconds and seconds > 0:
            self._delay[domain] = float(seconds)

    def wait(self, domain: str):
        delay = self._delay.get(domain, self.default_delay)
        elapsed = time.time() - self._last[domain]
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self._last[domain] = time.time()