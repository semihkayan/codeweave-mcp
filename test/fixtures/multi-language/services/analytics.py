"""Analytics tracking service."""


class AnalyticsTracker:
    """Tracks user events.

    @tags: analytics, tracking
    """

    def track_event(self, event_name: str, data: dict) -> bool:
        """Track a single event.

        @tags: analytics
        @side_effects: external_api
        """
        pass

    def get_metrics(self) -> dict:
        """Get aggregated metrics."""
        pass
