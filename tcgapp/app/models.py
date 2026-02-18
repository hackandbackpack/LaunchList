from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))

    groups: Mapped[list["Group"]] = relationship(back_populates="category")
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Group(Base):
    __tablename__ = "groups"

    group_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(255))
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    category: Mapped["Category"] = relationship(back_populates="groups")
    products: Mapped[list["Product"]] = relationship(back_populates="group")


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.group_id"), nullable=True
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.category_id"))
    name: Mapped[str] = mapped_column(String(255))
    clean_name: Mapped[str] = mapped_column(String(255))
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rarity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_type: Mapped[str] = mapped_column(String(20), default="single")

    category: Mapped["Category"] = relationship(back_populates="products")
    group: Mapped["Group | None"] = relationship(back_populates="products")
    skus: Mapped[list["Sku"]] = relationship(back_populates="product")
    current_prices: Mapped[list["CurrentPrice"]] = relationship(
        back_populates="product"
    )
    price_history: Mapped[list["PriceHistory"]] = relationship(
        back_populates="product"
    )


class Sku(Base):
    __tablename__ = "skus"

    sku_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    condition: Mapped[str] = mapped_column(String(30))
    language: Mapped[str] = mapped_column(String(20), default="English")

    product: Mapped["Product"] = relationship(back_populates="skus")


class CurrentPrice(Base):
    __tablename__ = "current_prices"

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.product_id"), primary_key=True
    )
    variant: Mapped[str] = mapped_column(String(50), primary_key=True)
    market_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    low_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    mid_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    direct_low: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
    source: Mapped[str] = mapped_column(String(20), default="justtcg")

    product: Mapped["Product"] = relationship(back_populates="current_prices")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    date: Mapped[date] = mapped_column(Date)
    market_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    low_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="justtcg")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    product: Mapped["Product"] = relationship(back_populates="price_history")

    __table_args__ = (
        UniqueConstraint("product_id", "variant", "date", name="uq_price_per_day"),
    )


class WatchlistItem(Base):
    __tablename__ = "watchlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship()
    alerts: Mapped[list["PriceAlert"]] = relationship(back_populates="watchlist_item")


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlist.id"))
    threshold_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    time_window: Mapped[str] = mapped_column(String(10))
    direction: Mapped[str] = mapped_column(String(10), default="both")
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)

    watchlist_item: Mapped["WatchlistItem"] = relationship(back_populates="alerts")


class SealedTracking(Base):
    __tablename__ = "sealed_tracking"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    variant: Mapped[str] = mapped_column(String(50), default="Normal")
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship()
