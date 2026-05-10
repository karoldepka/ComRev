import time
from functools import wraps


def measure_time(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()

        result = func(*args, **kwargs)

        end = time.perf_counter()
        elapsed = end - start

        print(f"{elapsed:.6f}s taken by {func.__name__}")
        return result

    return wrapper