"""Content-type-filtered gzip compression for single-shot text responses."""

import gzip

COMPRESSIBLE_TYPES = frozenset(
    {
        "application/json",
        "text/html",
        "text/plain",
        "text/css",
        "application/javascript",
        "application/manifest+json",
    }
)


def _content_type(start_message) -> str:
    for k, v in start_message.get("headers", []):
        if k.lower() == b"content-type":
            return v.decode("latin-1").split(";")[0].strip().lower()
    return ""


class CompressibleGZipMiddleware:
    """Compress complete text responses, but never streamed responses."""

    def __init__(self, app, minimum_size: int = 1024):
        self.app = app
        self.minimum_size = minimum_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        accept = b""
        for k, v in scope.get("headers", []):
            if k.lower() == b"accept-encoding":
                accept = v
                break

        if b"gzip" not in accept:
            await self.app(scope, receive, send)
            return

        state = {"streamed": False}

        async def send_wrapper(message):
            msg_type = message["type"]

            if msg_type == "http.response.start":
                state["start"] = message
                state["compress"] = (
                    message["status"] == 200
                    and _content_type(message) in COMPRESSIBLE_TYPES
                )
                return

            if msg_type == "http.response.body":
                # Once a response starts streaming, pass every chunk through.
                # Never try to compress its final chunk separately.
                if state["streamed"]:
                    await send(message)
                    return

                if message.get("more_body"):
                    state["streamed"] = True
                    start = state.pop("start", None)
                    if start is not None:
                        await send(start)
                    await send(message)
                    return

                body = message.get("body", b"")
                start = state.get("start")

                if (
                    start is not None
                    and state.get("compress")
                    and len(body) >= self.minimum_size
                ):
                    compressed = gzip.compress(body, compresslevel=6)
                    if len(compressed) < len(body):
                        start = state.pop("start")
                        headers = [
                            (k, v)
                            for k, v in start.get("headers", [])
                            if k.lower() not in (b"content-length", b"content-encoding")
                        ]
                        headers += [
                            (b"content-length", str(len(compressed)).encode()),
                            (b"content-encoding", b"gzip"),
                            (b"vary", b"accept-encoding"),
                        ]
                        start["headers"] = headers
                        await send(start)
                        await send({
                            "type": "http.response.body",
                            "body": compressed,
                        })
                        return

                start = state.pop("start", None)
                if start is not None:
                    await send(start)
                await send(message)
                return

            await send(message)

        await self.app(scope, receive, send_wrapper)

        # Defensive handling if the app exits without a body message.
        start = state.pop("start", None)
        if start is not None:
            await send(start)
            await send({"type": "http.response.body", "body": b""})
