"""Development demonstrations served by the pipeline (SPEC-2207).

The route layer of the demonstrations, behind the development guard. Nothing here is a production
use case; a demonstration delegates to the real Python use case when it exists and only reads the
tables when the page is a state summary.
"""
