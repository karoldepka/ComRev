import functools
import inspect
import logging
import time

logger = logging.getLogger("app")
logging.basicConfig(level=logging.INFO)


def log(func):
    module = func.__module__
    name = func.__name__
    full_name = f"{module}.{name}"

    def safe(v, max_len=120):
        try:
            s = repr(v)
        except Exception:
            s = "<unrepr>"
        return s if len(s) <= max_len else s[:max_len] + "..."

    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger.info(f"[ENTER] {full_name} args={[safe(a) for a in args]} kwargs={{k: safe(v) for k,v in kwargs.items()}}")
            start = time.time()
            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start
                logger.info(f"[EXIT]  {full_name} ({duration:.3f}s)")
                return result
            except Exception as e:
                duration = time.time() - start
                logger.exception(f"[ERROR] {full_name} ({duration:.3f}s) -> {e}")
                raise

        return async_wrapper

    else:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            logger.info(f"[ENTER] {full_name} args={[safe(a) for a in args]} kwargs={{k: safe(v) for k,v in kwargs.items()}}")
            start = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start
                logger.info(f"[EXIT]  {full_name} ({duration:.3f}s)")
                return result
            except Exception as e:
                duration = time.time() - start
                logger.exception(f"[ERROR] {full_name} ({duration:.3f}s) -> {e}")
                raise

        return sync_wrapper
        
        