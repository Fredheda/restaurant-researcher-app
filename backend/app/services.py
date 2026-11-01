"""The service objects an app instance is built from.

`create_app` takes a `Services`; production builds it from settings, tests
pass fakes. Nothing here imports a real client.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Services:
    pass
