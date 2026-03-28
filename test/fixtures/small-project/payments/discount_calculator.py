"""Discount calculation utilities."""


def calculate_discount(total: float, coupon) -> float:
    """Calculate discount amount.

    @tags: discount, pricing
    """
    if coupon.type == "percentage":
        return total * (coupon.value / 100)
    return coupon.value
