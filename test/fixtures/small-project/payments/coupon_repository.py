"""Coupon repository — database access layer."""


async def find_by_code(code: str) -> "Coupon":
    """Find a coupon by its code.

    @side_effects: database_read
    @tags: coupon, database
    """
    pass


def list_active_coupons() -> list:
    """List all active coupons.

    @tags: coupon, database
    """
    pass
