"""Coupon application module."""

from payments.coupon_repository import find_by_code
from payments.discount_calculator import calculate_discount
import logging

logger = logging.getLogger(__name__)


class CouponApplicator:
    """Handles coupon application logic.

    @tags: coupon, discount, pricing
    @state: coupon_cache
    @pattern: strategy
    """

    def __init__(self, repository):
        """Initialize with repository.

        @deps: coupon_repository
        """
        self.repository = repository
        self.cache = {}

    async def apply_coupon(self, order: "Order", coupon_code: str) -> "OrderResult":
        """Applies coupon discount to order total.

        @deps: coupon_repository.find_by_code, discount_calculator.calculate_discount
        @side_effects: database_read, modifies_state
        @tags: coupon, discount, pricing
        """
        coupon = await self.repository.find_by_code(coupon_code)
        if not coupon:
            logger.warning(f"Coupon not found: {coupon_code}")
            return OrderResult(success=False, error="Invalid coupon")

        discount = calculate_discount(order.total, coupon)
        order.apply_discount(discount)
        return OrderResult(success=True, total=order.total)

    def _validate_coupon(self, coupon):
        """Internal validation."""
        return coupon.is_active and not coupon.is_expired


def format_coupon_display(coupon) -> str:
    """Format coupon for display.

    @tags: coupon, display
    """
    return f"{coupon.code}: {coupon.discount}% off"
